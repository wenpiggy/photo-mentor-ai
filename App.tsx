
import React, { useState, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { FeedbackDisplay } from './components/FeedbackDisplay';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { CommunityFeed } from './components/CommunityFeed';
import { SharedPhotoDetailView } from './components/SharedPhotoDetailView';
import { 
  type PhotoAnalysisFeedback, type ImageFileState, Status, 
  AppView, type SharedPhoto, type Comment,
  type CropCoordinates, SimpleStatus
} from './types';
import { geminiVisionService } from './services/geminiVisionService';
import { APP_TITLE, SHARE_ICON_SVG, ANONYMOUS_USER_NAME, CROP_SUGGESTION_KEYWORDS } from './constants';

const App: React.FC = () => {
  const [imageState, setImageState] = useState<ImageFileState>({ file: null, previewUrl: null, base64Data: null, error: null, rawFileInfo: null });
  const [feedback, setFeedback] = useState<PhotoAnalysisFeedback | null>(null);
  const [status, setStatus] = useState<Status>(Status.IDLE);
  const [error, setError] = useState<string | null>(null);

  // --- Community Feature State ---
  const [currentView, setCurrentView] = useState<AppView>(AppView.ANALYZER);
  const [sharedPhotos, setSharedPhotos] = useState<SharedPhoto[]>([]); 
  const [selectedPhoto, setSelectedPhoto] = useState<SharedPhoto | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [photoTitle, setPhotoTitle] = useState("");

  // --- AI Crop Suggestion State ---
  const [suggestedCrop, setSuggestedCrop] = useState<CropCoordinates | null>(null);
  const [cropSuggestionStatus, setCropSuggestionStatus] = useState<SimpleStatus>(SimpleStatus.IDLE);
  const [showCropSuggestionButton, setShowCropSuggestionButton] = useState<boolean>(false);
  const [showCropOverlay, setShowCropOverlay] = useState<boolean>(false);
  const [cropSuggestionError, setCropSuggestionError] = useState<string | null>(null);


  const resetCropSuggestionStates = () => {
    setSuggestedCrop(null);
    setCropSuggestionStatus(SimpleStatus.IDLE);
    setShowCropSuggestionButton(false);
    setShowCropOverlay(false);
    setCropSuggestionError(null);
  };

  const handleImageUpload = useCallback((newImageState: ImageFileState) => {
    setImageState(newImageState); // newImageState에는 rawFileInfo가 포함될 수 있음
    setFeedback(null);
    setError(null); // 앱 레벨의 분석 에러는 초기화
    setStatus(Status.IDLE);
    resetCropSuggestionStates();
    // newImageState.error는 ImageUploader에서 발생한 파일 유효성 검사 오류 (예: 크기, 타입)
    // 이 오류는 ImageUploader 내부에서 표시되므로, App 레벨의 setError는 주석 처리하거나 조건부로 설정.
    // if (newImageState.error) {
    //   setError(newImageState.error); // App 레벨 에러로 설정하면 중복 표시될 수 있음
    //   setStatus(Status.FAILED);
    // }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (imageState.error) { // ImageUploader에서 발생한 오류가 있으면 분석 진행 안 함
        setError(`이미지 업로드 오류: ${imageState.error} 새로운 이미지를 업로드해주세요.`);
        setStatus(Status.FAILED);
        return;
    }
    if (!imageState.base64Data || !imageState.file?.type) {
      setError("먼저 유효한 이미지를 업로드해주세요.");
      setStatus(Status.FAILED);
      return;
    }
    console.log("[App.tsx] handleAnalyze: Initiating analysis.");
    setStatus(Status.ANALYZING);
    setError(null);
    setFeedback(null);
    resetCropSuggestionStates();

    try {
      // 실제 API로 전송될 MIME 타입 결정
      // 브라우저가 RAW 파일에 대해 'application/octet-stream' 등을 반환할 수 있으므로,
      // 알려진 이미지 MIME 타입이 아니면 기본값(예: image/jpeg)으로 시도하거나,
      // Gemini가 타입을 추론하도록 MIME 타입을 명시하지 않을 수도 있습니다.
      // 여기서는 file.type을 그대로 사용하되, 서비스 레이어에서 필요시 조정할 수 있습니다.
      let mimeTypeForApi = imageState.file.type;
      if (!mimeTypeForApi || mimeTypeForApi === 'application/octet-stream') {
        // RAW 파일 확장자 목록을 사용하여 JPEG로 가정 (Gemini는 일부 RAW preview를 JPEG로 처리 가능)
        const fileExtension = `.${imageState.file.name.split('.').pop()?.toLowerCase() || ''}`;
        if (['.arw', '.cr2', '.nef', '.dng', '.raf', '.orf', '.pef', '.srw', '.rw2'].includes(fileExtension)) {
            mimeTypeForApi = 'image/jpeg'; // 또는 image/png 등 Gemini가 잘 처리하는 포맷으로 가정
            console.warn(`[App.tsx] RAW file (${fileExtension}) detected with generic MIME type. Assuming ${mimeTypeForApi} for API call.`);
        }
      }


      const analysisResult = await geminiVisionService.analyzeImageComposition(imageState.base64Data, mimeTypeForApi);
      setFeedback({...analysisResult, id: Date.now().toString() });
      setStatus(Status.SUCCEEDED);
      console.log("[App.tsx] handleAnalyze: Analysis successful.", analysisResult);

      // Determine if crop suggestion button should be shown
      if (analysisResult.areasForImprovement && analysisResult.areasForImprovement.length > 0) {
        const showButton = analysisResult.areasForImprovement.some(area =>
          CROP_SUGGESTION_KEYWORDS.some(keyword => area.toLowerCase().includes(keyword))
        );
        setShowCropSuggestionButton(showButton);
      }

    } catch (err) {
      console.error("[App.tsx] handleAnalyze: Analysis failed.", err);
      const errorMessage = (err instanceof Error) ? err.message : "분석 중 알 수 없는 오류가 발생했습니다.";
      const genericApiErrorMsg = "Gemini API 통신 중 오류가 발생했습니다. 네트워크 연결을 확인하거나 잠시 후 다시 시도해주세요. 문제가 지속되면 API 키 및 할당량을 확인해주세요.";

      if (errorMessage.toLowerCase().includes("api key not valid") || errorMessage.includes("API 키가 유효하지 않습") || errorMessage.includes("API 키가 잘못되었습니다")) {
         setError("잘못된 API 키입니다: GEMINI_API_KEY 환경 변수가 올바르게 설정되었는지 확인하거나 API 키 값을 확인해주세요.");
      } else if (errorMessage.toLowerCase().includes("quota") || errorMessage.includes("할당량")) {
         setError("API 할당량 초과: Gemini API 사용 한도에 도달했습니다. 계정을 확인하거나 나중에 다시 시도해주세요.");
      } else if (errorMessage.includes("API_KEY가 구성되지 않았습니다")) {
         setError(errorMessage); 
      } else {
         setError(errorMessage.length > 200 ? genericApiErrorMsg : errorMessage);
      }
      setStatus(Status.FAILED);
    }
  }, [imageState.base64Data, imageState.file, imageState.error]);

  const handleResetAnalyzer = useCallback(() => {
    setImageState({ file: null, previewUrl: null, base64Data: null, error: null, rawFileInfo: null });
    setFeedback(null);
    setStatus(Status.IDLE);
    setError(null);
    resetCropSuggestionStates();
    setShowShareModal(false);
    setPhotoTitle("");
  }, []);

  // --- AI Crop Suggestion Handlers ---
  const handleRequestCropSuggestion = useCallback(async () => {
    if (!imageState.base64Data || !imageState.file?.type || !feedback) {
      setCropSuggestionError("크롭 제안을 생성하려면 먼저 이미지를 분석해야 합니다.");
      setCropSuggestionStatus(SimpleStatus.FAILED);
      return;
    }
    console.log("[App.tsx] handleRequestCropSuggestion: Requesting crop suggestion.");
    setCropSuggestionStatus(SimpleStatus.LOADING);
    setCropSuggestionError(null);
    setShowCropOverlay(false); 

    try {
      const cropResult = await geminiVisionService.suggestOptimalCrop(
        imageState.base64Data,
        imageState.file.type, // 원본 MIME 타입 사용, 필요시 서비스에서 조정
        feedback.areasForImprovement
      );
      if (cropResult) {
        setSuggestedCrop(cropResult);
        setShowCropOverlay(true); 
        setCropSuggestionStatus(SimpleStatus.SUCCEEDED);
        console.log("[App.tsx] handleRequestCropSuggestion: Crop suggestion successful.", cropResult);
      } else {
        setCropSuggestionError("AI가 이 이미지에 대한 크롭 제안을 찾지 못했습니다. 다른 이미지를 시도해보세요.");
        setCropSuggestionStatus(SimpleStatus.FAILED);
        setShowCropOverlay(false);
        console.warn("[App.tsx] handleRequestCropSuggestion: No crop suggestion found by AI.");
      }
    } catch (err) {
      console.error("[App.tsx] handleRequestCropSuggestion: Crop suggestion failed.", err);
      const message = (err instanceof Error) ? err.message : "크롭 제안을 가져오는 중 알 수 없는 오류 발생";
      setCropSuggestionError(message);
      setCropSuggestionStatus(SimpleStatus.FAILED);
      setShowCropOverlay(false);
    }
  }, [imageState.base64Data, imageState.file?.type, feedback]);

  const toggleCropOverlay = useCallback(() => {
    if (suggestedCrop) {
      setShowCropOverlay(prev => !prev);
    }
  }, [suggestedCrop]);


  // --- Community Feature Handlers ---
  const handleNavigate = useCallback((view: AppView) => {
    setCurrentView(view);
    setSelectedPhoto(null); 
    if (view !== AppView.ANALYZER) { 
      // 분석기 뷰가 아니면, 분석기 상태 초기화 (선택적: 사용자가 다시 돌아올 때 유지하고 싶을 수도 있음)
      // handleResetAnalyzer(); 
    }
  }, []);

  const handleShareToCommunity = useCallback(() => {
    if (!imageState.previewUrl || !imageState.file?.type || !feedback) {
      setError("커뮤니티에 공유할 이미지가 없거나 분석 결과가 없습니다.");
      setShowShareModal(false);
      return;
    }
    
    const newSharedPhoto: SharedPhoto = {
      id: `photo-${Date.now().toString()}`,
      uploaderName: ANONYMOUS_USER_NAME, 
      imageUrl: imageState.previewUrl, // 이미 base64 data URL
      imageMimeType: imageState.file.type,
      aiFeedback: feedback,
      comments: [],
      sharedAt: new Date(),
      title: photoTitle || "제목 없음",
    };
    
    setSharedPhotos(prevPhotos => [newSharedPhoto, ...prevPhotos]); 
    setShowShareModal(false);
    setPhotoTitle("");
    // 공유 후 분석기 상태 초기화 또는 다른 뷰로 이동
    handleResetAnalyzer(); // 현재 분석기 상태 초기화
    alert("사진이 커뮤니티에 공유되었습니다!");
    setCurrentView(AppView.COMMUNITY_FEED); 
  }, [imageState, feedback, photoTitle, handleResetAnalyzer]);

  const handleSelectPhotoForDetail = useCallback((photo: SharedPhoto) => {
    setSelectedPhoto(photo);
    setCurrentView(AppView.PHOTO_DETAIL);
  }, []);

  const handleAddComment = useCallback((photoId: string, commentText: string) => {
    const newComment: Comment = {
      id: `comment-${Date.now().toString()}`,
      photoId: photoId,
      author: ANONYMOUS_USER_NAME, 
      text: commentText,
      timestamp: new Date(),
    };

    setSharedPhotos(prevPhotos =>
      prevPhotos.map(photo =>
        photo.id === photoId
          ? { ...photo, comments: [...photo.comments, newComment] }
          : photo
      )
    );
    if (selectedPhoto && selectedPhoto.id === photoId) {
      setSelectedPhoto(prev => prev ? {...prev, comments: [...prev.comments, newComment]} : null);
    }
  }, [selectedPhoto]);
  
  const renderAnalyzerView = () => {
    const isAnalyzing = status === Status.ANALYZING;

    return (
    <>
      <ImageUploader 
        onImageUpload={handleImageUpload} 
        onReset={handleResetAnalyzer} 
        currentImage={imageState.previewUrl} 
        imageError={imageState.error} // ImageUploader 내부에서 파일 유효성 검사 오류 표시
        rawFileInfo={imageState.rawFileInfo} // ImageUploader 내부에서 RAW 파일 정보 표시
        suggestedCrop={suggestedCrop}
        showCropOverlay={showCropOverlay}
      />

      {imageState.previewUrl && !imageState.error && !isAnalyzing && status !== Status.SUCCEEDED && (
        <div className="mt-6 text-center">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !imageState.base64Data || !!imageState.error} // imageState.error도 비활성화 조건에 추가
            className="px-8 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="선택된 이미지의 구도 분석 실행"
          >
            {isAnalyzing ? '분석 중...' : '구도 분석하기'}
          </button>
        </div>
      )}

      {isAnalyzing && (
        <div className="mt-12 flex justify-center">
          <LoadingSpinner text={`${APP_TITLE} AI가 분석 중입니다...`} size="large"/>
        </div>
      )}
      
      {/* App 레벨의 분석 오류 메시지 (ImageUploader의 파일 오류와 구분) */}
      {status === Status.FAILED && error && ( 
        <div className="mt-12">
          <ErrorMessage title="분석 실패" message={error} />
        </div>
      )}

      {status === Status.SUCCEEDED && feedback && (
        <div className="mt-12">
          <FeedbackDisplay 
            feedback={feedback}
            showCropSuggestionButton={showCropSuggestionButton}
            onSuggestCrop={handleRequestCropSuggestion}
            cropSuggestionStatus={cropSuggestionStatus}
            cropSuggestionError={cropSuggestionError}
            hasSuggestedCrop={!!suggestedCrop}
            showCropOverlay={showCropOverlay}
            onToggleCropOverlay={toggleCropOverlay}
          />
          <div className="mt-8 text-center">
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center justify-center gap-2 mx-auto px-6 py-3 bg-secondary hover:bg-secondary-dark text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2 transition-colors duration-150 ease-in-out"
              aria-label="AI 분석 결과를 커뮤니티에 공유"
            >
              <span dangerouslySetInnerHTML={{ __html: SHARE_ICON_SVG }} aria-hidden="true"></span>
              커뮤니티에 공유하기
            </button>
          </div>
        </div>
      )}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-xl font-semibold mb-4 text-neutral-800">사진 공유하기</h3>
            <p className="text-sm text-neutral-600 mb-1">커뮤니티에 사진을 공유합니다. 간단한 제목을 추가할 수 있습니다 (선택 사항).</p>
            <img src={imageState.previewUrl!} alt="공유할 이미지 미리보기" className="max-h-60 w-auto mx-auto rounded-md mb-4 border"/>
            <input
              type="text"
              value={photoTitle}
              onChange={(e) => setPhotoTitle(e.target.value)}
              placeholder="사진 제목 (예: 해질녘 풍경)"
              className="w-full p-2 border border-neutral-300 rounded-md mb-4 focus:ring-primary focus:border-primary"
              maxLength={100}
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {setShowShareModal(false); setPhotoTitle("");}}
                className="px-4 py-2 text-neutral-700 bg-neutral-200 hover:bg-neutral-300 rounded-md transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleShareToCommunity}
                className="px-4 py-2 text-white bg-primary hover:bg-primary-dark rounded-md transition-colors"
              >
                공유
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    );
  };

  const memoizedSharedPhotos = useMemo(() => sharedPhotos, [sharedPhotos]);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-800 font-sans flex flex-col">
      <Header currentView={currentView} onNavigate={handleNavigate} />
      <main className="container mx-auto px-4 py-8 flex-grow w-full max-w-4xl">
        {currentView === AppView.ANALYZER && renderAnalyzerView()}
        {currentView === AppView.COMMUNITY_FEED && (
          <CommunityFeed 
            photos={memoizedSharedPhotos} 
            onSelectPhoto={handleSelectPhotoForDetail} 
          />
        )}
        {currentView === AppView.PHOTO_DETAIL && selectedPhoto && (
          <SharedPhotoDetailView 
            photo={selectedPhoto} 
            onAddComment={handleAddComment}
            onBack={() => {setSelectedPhoto(null); setCurrentView(AppView.COMMUNITY_FEED);}}
          />
        )}
      </main>
      <footer className="w-full text-center py-6 text-neutral-600 border-t border-neutral-300 mt-auto bg-white">
        <p>&copy; {new Date().getFullYear()} {APP_TITLE}. Gemini 기반 구도 분석 및 커뮤니티.</p>
        <p className="text-xs mt-1">커뮤니티 데이터는 브라우저 세션 중에만 유지됩니다.</p>
      </footer>
    </div>
  );
};

export default App;
