import React, { useState, useEffect, useRef, useCallback } from "react";
import { Answers, AppState, StudentResult, TestVersion, User, ScoreConfig } from "./types";
import ControlPanel from "./components/ControlPanel";
import PdfViewer from "./components/PdfViewer";
import MarkdownViewer from "./components/MarkdownViewer";
import AnswerSheet from "./components/AnswerSheet";
import AllResultsView from "./components/ResultsView";
import {
  calculateScore,
  calculateMaxScore,
  normalizeAnswer,
  normalizeQuestionKey,
  parseAnswerKey,
  sanitizeSessionCode,
  isValidSessionCode,
} from "./utils";
import LoginScreen from "./components/LoginScreen";
import StudentSessionLoader from "./components/StudentSessionLoader";
import StudentResultView from "./components/StudentResultView";
import RoleSelectionScreen from "./components/RoleSelectionScreen";
import SubmissionSuccessView from "./components/SubmissionSuccessView";
import TestCompletedScreen from "./components/TestCompletedScreen";
import TeacherDashboard from "./components/TeacherDashboard";
import PendingApprovalScreen from "./components/PendingApprovalScreen";
import AdminDashboard from "./components/AdminDashboard";

import { db, auth } from "./firebase";
import { collection, doc, setDoc, getDoc, getDocs, addDoc, query, where, onSnapshot, serverTimestamp, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

declare global {
  interface Window {
    XLSX: any;
    html2pdf: any;
    pako: any;
  }
}

const safeLocalStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("localStorage is not available:", e);
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("localStorage is not available:", e);
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("localStorage is not available:", e);
    }
  },
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.START_SCREEN);
  const [testVersions, setTestVersions] = useState<Map<string, TestVersion>>(
    new Map(),
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Cleanup previous user doc listener
      if (unsubUserDocRef.current) {
        unsubUserDocRef.current();
        unsubUserDocRef.current = null;
      }

      try {
        console.log("Auth state changed:", user?.email);
        if (user) {
          const userRef = doc(db, "users", user.uid);
          
          // Use onSnapshot to listen for role changes in real-time
          unsubUserDocRef.current = onSnapshot(userRef, async (docSnap) => {
            let role = 'pending';
            
            if (docSnap.exists()) {
              role = docSnap.data().role || 'pending';
              console.log(`Real-time role update for ${user.email}: ${role}`);
              // Update display name if it was the default and we have a better one now
              if (docSnap.data().displayName === 'Giáo viên' && user.displayName) {
                await updateDoc(userRef, { displayName: user.displayName });
              }
            } else {
              console.log("User not found in Firestore, checking pre-approval...");
              // Check for pre-approved email
              const q = query(collection(db, 'users'), where('email', '==', user.email?.toLowerCase()));
              const querySnapshot = await getDocs(q);
              
              if (!querySnapshot.empty) {
                const preApprovedDoc = querySnapshot.docs[0];
                role = preApprovedDoc.data().role || 'pending';
                console.log("Pre-approved role found:", role);
                
                // If it was a pre-approved record (empty UID or temp ID)
                if (preApprovedDoc.id !== user.uid) {
                  console.log("Updating pre-approved record to proper UID...");
                  await setDoc(userRef, {
                    uid: user.uid,
                    email: user.email?.toLowerCase(),
                    displayName: user.displayName || preApprovedDoc.data().displayName || 'Giáo viên',
                    role: role,
                    createdAt: preApprovedDoc.data().createdAt || new Date().toISOString()
                  });
                  await deleteDoc(doc(db, 'users', preApprovedDoc.id));
                }
              } else {
                // New user, not pre-approved
                role = user.email?.toLowerCase() === 'pvda.mcb@gmail.com' ? 'admin' : 'pending';
                console.log(`Setting initial role for new user ${user.email}: ${role}`);
                await setDoc(userRef, {
                  uid: user.uid,
                  email: user.email?.toLowerCase(),
                  displayName: user.displayName || 'Giáo viên',
                  role: role,
                  createdAt: new Date().toISOString()
                });
              }
            }
            setCurrentUser({ username: user.displayName || 'Giáo viên', role: role as 'teacher' | 'admin' | 'pending' | 'locked' });
          }, (error) => {
            console.error("Error in user doc snapshot:", error);
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          });
        } else {
          console.log("No user logged in, clearing current user state.");
          setCurrentUser(null);
        }
      } catch (globalError) {
        console.error("Global error in onAuthStateChanged:", globalError);
      } finally {
        console.log("Auth readiness set to true.");
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  const [numMultipleChoice, setNumMultipleChoice] = useState<number>(0);
  const [numTrueFalse, setNumTrueFalse] = useState<number>(0);
  const [numShortAnswer, setNumShortAnswer] = useState<number>(0);
  const [numFreeResponse, setNumFreeResponse] = useState<number>(0);
  const [scoreConfig, setScoreConfig] = useState<ScoreConfig>({ mcPoints: 0.25, tfPoints: 0.25, saPoints: 0.25, frPoints: 1.0, totalScore: 10 });
  const [teacherPassword, setTeacherPassword] = useState<string>("");
  const [allowedStudents, setAllowedStudents] = useState<{ studentId: string; name: string; class: string; additionalData?: Record<string, string> }[]>([]);
  const [additionalStudentFields, setAdditionalStudentFields] = useState<string[]>([]);
  const [testDuration, setTestDuration] = useState<number>(0);
  const [testName, setTestName] = useState<string>("");
  const [testStartTime, setTestStartTime] = useState<string>("");
  const [testEndTime, setTestEndTime] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const [allStudentResults, setAllStudentResults] = useState<StudentResult[]>(
    [],
  );
  const [activeParticipants, setActiveParticipants] = useState<{
    id?: string;
    name: string;
    class: string;
    studentId: string;
    testVersionId: string;
    joinTime: string;
  }[]>([]);
  const [currentStudent, setCurrentStudent] = useState<{
    name: string;
    class: string;
    studentId?: string;
    additionalData?: Record<string, string>;
    answers: Answers;
    testVersionId: string;
  } | null>(null);
  const [lastStudentResult, setLastStudentResult] =
    useState<StudentResult | null>(null);
  const [currentUser, setCurrentUser] = useState<Pick<
    User,
    "username" | "role"
  > | null>(null);

  const [violationCount, setViolationCount] = useState<number>(0);
  const violationCountRef = useRef(0);

  useEffect(() => {
    violationCountRef.current = violationCount;
  }, [violationCount]);

  const unsubUserDocRef = useRef<(() => void) | null>(null);

  const [isFocusWarningModalOpen, setIsFocusWarningModalOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  const showAlert = useCallback((message: string) => {
    setAlertMessage(message);
    setIsAlertModalOpen(true);
  }, []);

  const [isStudentSession, setIsStudentSession] = useState<boolean>(false);
  const [shareLink, setShareLink] = useState("");
  const [isShareLinkModalOpen, setIsShareLinkModalOpen] = useState(false);
  const [viewingSection, setViewingSection] = useState<
    "mc" | "tf" | "sa" | "fr" | "all"
  >("mc");
  const [activeMobileTab, setActiveMobileTab] = useState<"pdf" | "answers">(
    "pdf",
  );

  useEffect(() => {
    if (appState === AppState.TEST_TAKING) {
      const pdfFile = currentStudent
        ? testVersions.get(currentStudent.testVersionId)?.testFile
        : null;
      if (!pdfFile) {
        setActiveMobileTab("answers");
      }
    }
  }, [appState, currentStudent, testVersions]);
  const [currentRole, setCurrentRole] = useState<"teacher" | "student" | null>(
    null,
  );

  const STUDENT_FOCUS_STATES = [
    AppState.STUDENT_ENTRY,
    AppState.TEST_TAKING,
    AppState.SUBMISSION_SUCCESS,
    AppState.STUDENT_REVIEW,
  ];
  const TEACHER_FULLSCREEN_STATES = [AppState.ALL_RESULTS];

  const currentStudentRef = useRef(currentStudent);
  const appStateRef = useRef(appState);
  const allStudentResultsRef = useRef(allStudentResults);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    currentStudentRef.current = currentStudent;
  }, [currentStudent]);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    allStudentResultsRef.current = allStudentResults;
  }, [allStudentResults]);

  // Handle redirection logic for invalid states (Submission Success / Review)
  const handleBackToStudentEntry = useCallback(() => {
    setAppState(AppState.STUDENT_ENTRY);
  }, []);

  useEffect(() => {
    if (
      appState === AppState.SUBMISSION_SUCCESS ||
      appState === AppState.STUDENT_REVIEW
    ) {
      const isValid =
        lastStudentResult && testVersions.has(lastStudentResult.testVersionId);
      if (!isValid) {
        handleBackToStudentEntry();
      }
    }
  }, [appState, lastStudentResult, testVersions, handleBackToStudentEntry]);

  const handleSubmit = useCallback(
    async (submissionType: StudentResult["submissionType"] = "manual") => {
      if (isSubmittingRef.current) {
        console.log("Đang nộp bài, bỏ qua yêu cầu nộp bài trùng lặp.");
        return;
      }
      isSubmittingRef.current = true;

      const studentToSubmit = currentStudentRef.current;
      if (studentToSubmit) {
        // Check if already submitted
        const isDuplicate = allStudentResultsRef.current.some(
          (result) => result.studentId === studentToSubmit.studentId
        );
        if (isDuplicate && !scoreConfig.allowMultipleAttempts) {
          showAlert("Bài này đã được nộp rồi.");
          isSubmittingRef.current = false;
          return;
        }

        const version = testVersions.get(studentToSubmit.testVersionId);
        const correctAnswers = version ? version.correctAnswers : {};
        const score = calculateScore(
          studentToSubmit.answers,
          correctAnswers,
          numMultipleChoice,
          numTrueFalse,
          numShortAnswer,
          numFreeResponse,
          scoreConfig
        );

        const result: StudentResult = {
          ...studentToSubmit,
          sessionId: sessionId || undefined,
          submissionType,
          submissionTime: new Date().toISOString(),
          score,
          violationCount: violationCountRef.current
        };

        if (sessionId) {
          try {
            const safeStudentId = studentToSubmit.studentId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const resultRef = scoreConfig.allowMultipleAttempts 
              ? doc(collection(db, "sessions", sessionId, "results")) 
              : doc(db, "sessions", sessionId, "results", safeStudentId);
            await setDoc(resultRef, result);
          } catch (error: any) {
            console.error("Failed to save result to Firestore:", error);
            if (error.code === 'permission-denied' || (error.message && error.message.toLowerCase().includes('permission'))) {
               showAlert("Bài này đã được nộp rồi (Số báo danh/Mã học sinh đã tồn tại).");
               isSubmittingRef.current = false;
               return;
            }
            alert("Không thể nộp bài. Phiên làm bài có thể đã kết thúc hoặc có lỗi kết nối.");
            isSubmittingRef.current = false;
            handleFirestoreError(error, OperationType.CREATE, `sessions/${sessionId}/results`);
            return; // Stop submission
          }
        }

        setAllStudentResults((prev) => {
          const newResults = [...prev, result];
          safeLocalStorage.setItem(
            "studentResults",
            JSON.stringify(newResults),
          );
          return newResults;
        });
        setLastStudentResult(result);
        setCurrentStudent(null);
        setAppState(AppState.SUBMISSION_SUCCESS);
      }
      isSubmittingRef.current = false;
    },
    [sessionId, testVersions, numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, showAlert],
  );

  const fileToDataURL = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const dataURLtoFile = useCallback(
    (dataurl: string, filename: string): File => {
      const arr = dataurl.split(",");
      const mimeMatch = arr[0].match(/:(.*?);/);
      if (!mimeMatch) throw new Error("Invalid data URL");
      const mime = mimeMatch[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime });
    },
    [],
  );

  const handleSetupSession = useCallback(
    async (
      versions: { id: string; testFile?: File; answerKeyFile?: File; correctAnswers?: any; testContent?: string; isAIGenerated?: boolean }[],
      mc: number,
      tf: number,
      sa: number,
      fr: number,
      password: string,
      duration: number,
      name: string,
      startTime: string,
      endTime: string,
      scoreConfigParam: ScoreConfig,
      persist: boolean,
      allowedStudentsParam?: { studentId: string; name: string; class: string; additionalData?: Record<string, string> }[],
      additionalStudentFieldsParam?: string[],
    ) => {
      try {
        const newTestVersions = new Map<string, TestVersion>();
        for (const v of versions) {
          const parsedAnswers = v.correctAnswers || (v.answerKeyFile ? await parseAnswerKey(v.answerKeyFile) : undefined);
          newTestVersions.set(v.id, {
            id: v.id,
            testFile: v.testFile,
            testContent: v.testContent,
            answerKeyFile: v.answerKeyFile,
            correctAnswers: parsedAnswers || {},
            isAIGenerated: v.isAIGenerated
          });
        }
        setTestVersions(newTestVersions);
        setNumMultipleChoice(mc);
        setNumTrueFalse(tf);
        setNumShortAnswer(sa);
        setNumFreeResponse(fr);
        setTeacherPassword(password);
        setTestDuration(duration);
        setTestName(name);
        setTestStartTime(startTime);
        setTestEndTime(endTime);
        setScoreConfig(scoreConfigParam);
        if (allowedStudentsParam) {
           setAllowedStudents(allowedStudentsParam);
        }
        if (additionalStudentFieldsParam) {
           setAdditionalStudentFields(additionalStudentFieldsParam);
        }

        if (persist) {
          const serializableVersions = await Promise.all(
            Array.from(newTestVersions.values()).map(async (v) => {
              const base: any = {
                id: v.id,
                correctAnswers: v.correctAnswers,
                isAIGenerated: v.isAIGenerated
              };
              if (v.testContent) {
                base.testContent = v.testContent;
              }
              if (v.testFile) {
                base.testFileDataUrl = await fileToDataURL(v.testFile);
                base.testFileName = v.testFile.name;
              }
              if (v.answerKeyFile) {
                base.answerKeyFileDataUrl = await fileToDataURL(v.answerKeyFile);
                base.answerKeyFileName = v.answerKeyFile.name;
              }
              return base;
            }),
          );
          const dataToSave = {
            versions: serializableVersions,
            config: { mc, tf, sa, fr, duration, testName: name, startTime, endTime, scoreConfig: scoreConfigParam, allowedStudents: allowedStudentsParam || [], additionalStudentFields: additionalStudentFieldsParam || [] },
            teacherPassword: password,
          };
          safeLocalStorage.setItem(
            "testSessionData",
            JSON.stringify(dataToSave),
          );
        }

        return newTestVersions;
      } catch {
        throw new Error("Failed to setup session");
      }
    },
    [fileToDataURL],
  );

  const handleReviewStudent = useCallback((result: StudentResult) => {
    setLastStudentResult(result);
    setAppState(AppState.STUDENT_REVIEW);
  }, []);

  const handleReturnToRoleSelection = useCallback(async () => {
    const performReset = async () => {
      safeLocalStorage.removeItem("testSessionData");
      safeLocalStorage.removeItem("studentResults");
      try {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
      } catch (e) {
        console.warn(
          "Cannot update history state (likely restricted environment):",
          e,
        );
      }
      setTestVersions(new Map());
      setNumMultipleChoice(0);
      setNumTrueFalse(0);
      setNumShortAnswer(0);
      setNumFreeResponse(0);
      setTeacherPassword("");
      setTestDuration(0);
      setTestName("");
      setAllStudentResults([]);
      setCurrentStudent(null);
      setLastStudentResult(null);
      setViolationCount(0);
      setCurrentUser(null);
      setIsStudentSession(false);
      setCurrentRole(null);
      setSessionId(null);
      
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch (error) {
          console.error("Error signing out:", error);
        }
      }
      
      setAppState(AppState.START_SCREEN);
    };

    if (document.fullscreenElement) {
      document
        .exitFullscreen()
        .catch((err) => {
          console.error("Lỗi khi thoát toàn màn hình:", err);
        })
        .finally(() => {
          performReset();
        });
    } else {
      performReset();
    }
  }, []);

  const loadSessionFromData = useCallback(
    async (data: any) => {
      try {
        const versionsFromFile = data.versions.map((v: any) => {
            const parsedVersion: any = {
                id: v.id,
                correctAnswers: v.correctAnswers,
                isAIGenerated: v.isAIGenerated || !!v.testContent
            };
            
            if (v.testContent) {
                parsedVersion.testContent = v.testContent;
            }
            if (v.testFileDataUrl && v.testFileName) {
               parsedVersion.testFile = dataURLtoFile(v.testFileDataUrl, v.testFileName);
            }
            if (v.answerKeyFileDataUrl && v.answerKeyFileName) {
               parsedVersion.answerKeyFile = dataURLtoFile(
                  v.answerKeyFileDataUrl,
                  v.answerKeyFileName,
               );
            }
            return parsedVersion;
        });

        // Backward compatibility check for 'sa' and 'scoreConfig'
        const sa = data.config.sa !== undefined ? data.config.sa : 0;
        const scoreConfig = data.config.scoreConfig || { mcPoints: 0.25, tfPoints: 0.25, saPoints: 0.25, frPoints: 1.0, totalScore: 10 };

        await handleSetupSession(
          versionsFromFile,
          data.config.mc,
          data.config.tf,
          sa,
          data.config.fr,
          data.teacherPassword,
          data.config.duration,
          data.config.testName || "",
          data.config.startTime || "",
          data.config.endTime || "",
          scoreConfig,
          false, // Don't persist back to local storage if we just loaded it
          data.config.allowedStudents || [],
          data.config.additionalStudentFields || []
        );
        setIsStudentSession(true);
        // loadSessionFromData is called when a student loads a session (from file or ID)
        // We want them to go to the entry screen (login) after the session is set up.
        setAppState(AppState.STUDENT_ENTRY);
      } catch (error) {
        console.error("Failed to load session from data:", error);
        alert("Dữ liệu phiên làm bài không hợp lệ hoặc đã bị hỏng.");
        handleReturnToRoleSelection();
      }
    },
    [dataURLtoFile, handleSetupSession, handleReturnToRoleSelection],
  );

  const handleViolation = useCallback(() => {
    if (appStateRef.current !== AppState.TEST_TAKING) return;
    
    const newCount = violationCountRef.current + 1;
    setViolationCount(newCount);
    
    if (newCount >= 3) {
      showAlert("Bạn đã vi phạm quy chế kiểm tra 3 lần (thoát toàn màn hình hoặc chuyển tab). Hệ thống sẽ tự động nộp bài.");
      handleSubmit("auto_violation");
    } else {
      showAlert(`Cảnh báo: Bạn đã vi phạm quy chế kiểm tra ${newCount}/3 lần (thoát toàn màn hình hoặc chuyển tab). Nếu vi phạm 3 lần, hệ thống sẽ tự động nộp bài.`);
    }
  }, [showAlert, handleSubmit]);

  // Effect for managing fullscreen mode and anti-cheat
  useEffect(() => {
    const isStudentFocusZone =
      isStudentSession && STUDENT_FOCUS_STATES.includes(appState);
    const isTeacherFullscreenZone =
      !isStudentSession &&
      currentRole === "teacher" &&
      TEACHER_FULLSCREEN_STATES.includes(appState);
    const shouldBeFullscreen = isStudentFocusZone || isTeacherFullscreenZone;
    const isFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (shouldBeFullscreen && !isFullscreen) {
      const docEl = document.documentElement as any;
      const requestFS =
        docEl.requestFullscreen ||
        docEl.webkitRequestFullscreen ||
        docEl.mozRequestFullScreen ||
        docEl.msRequestFullscreen;
      if (requestFS) {
        try {
          const promise = requestFS.call(docEl);
          if (promise && promise.catch) {
            promise.catch((err: any) =>
              console.log(
                `Error attempting to enable full-screen mode: ${err.message}`,
              ),
            );
          }
        } catch (err) {
          console.log(`Lỗi khi gọi requestFullscreen:`, err);
        }
      }
    }

    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      if (
        appStateRef.current === AppState.TEST_TAKING &&
        !isCurrentlyFullscreen
      ) {
        handleViolation();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    if (appState === AppState.TEST_TAKING) {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          handleViolation();
        }
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          // ESC is already handled by handleFullscreenChange when it exits fullscreen
          // but we can prevent default and trigger violation here for immediate feedback
          e.preventDefault();
          handleViolation();
        }
      };
      const preventDefault = (e: Event) => e.preventDefault();

      document.addEventListener("visibilitychange", handleVisibilityChange);
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("contextmenu", preventDefault);
      document.addEventListener("copy", preventDefault);
      document.addEventListener("cut", preventDefault);
      document.addEventListener("paste", preventDefault);

      return () => {
        document.removeEventListener(
          "fullscreenchange",
          handleFullscreenChange,
        );
        document.removeEventListener(
          "webkitfullscreenchange",
          handleFullscreenChange,
        );
        document.removeEventListener(
          "mozfullscreenchange",
          handleFullscreenChange,
        );
        document.removeEventListener(
          "MSFullscreenChange",
          handleFullscreenChange,
        );
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
        document.removeEventListener("keydown", handleKeyDown);
        document.removeEventListener("contextmenu", preventDefault);
        document.removeEventListener("copy", preventDefault);
        document.removeEventListener("cut", preventDefault);
        document.removeEventListener("paste", preventDefault);
      };
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange,
      );
    };
  }, [appState, isStudentSession, handleViolation, currentRole]);

  const finalEndTimeRef = useRef<Date | null>(null);

  // Timer effect
  useEffect(() => {
    if (appState === AppState.TEST_TAKING && (testDuration > 0 || testEndTime)) {
      // Calculate the absolute end time for this student only once
      if (!finalEndTimeRef.current) {
        let finalEndTime: Date | null = null;
        
        if (testEndTime) {
          finalEndTime = new Date(testEndTime);
        }
        
        if (testDuration > 0) {
          // The student has testDuration minutes from now
          const durationEndTime = new Date(Date.now() + testDuration * 60 * 1000);
          if (!finalEndTime || durationEndTime < finalEndTime) {
            finalEndTime = durationEndTime;
          }
        }
        finalEndTimeRef.current = finalEndTime;
      }

      const finalEndTime = finalEndTimeRef.current;
      if (!finalEndTime) return;

      let timerId: NodeJS.Timeout;

      // Initialize timeLeft based on finalEndTime
      const updateTimer = () => {
        const now = new Date();
        const remainingSeconds = Math.max(0, Math.floor((finalEndTime.getTime() - now.getTime()) / 1000));
        
        setTimeLeft(remainingSeconds);
        
        if (remainingSeconds <= 0) {
          if (timerId) clearInterval(timerId);
          setTimeout(() => handleSubmit("auto_timeout"), 0);
        }
      };

      updateTimer(); // Initial call
      timerId = setInterval(updateTimer, 1000);

      return () => {
        if (timerId) clearInterval(timerId);
      };
    } else {
      finalEndTimeRef.current = null;
      setTimeLeft(null);
    }
  }, [appState, testDuration, handleSubmit, testEndTime]);

  // Load from localStorage or URL on initial mount
  useEffect(() => {
    const initializeApp = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionParam = urlParams.get("session");

      if (sessionParam) {
        setAppState(AppState.LOADING_SESSION_FROM_URL);
        try {
          let resolvedSessionId = sessionParam.trim();
          let sessionRef = doc(db, "sessions", resolvedSessionId);
          let sessionSnap = await getDoc(sessionRef);
          
          if (!sessionSnap.exists() && resolvedSessionId !== resolvedSessionId.toUpperCase()) {
            const upperSnap = await getDoc(doc(db, "sessions", resolvedSessionId.toUpperCase()));
            if (upperSnap.exists()) {
              sessionSnap = upperSnap;
              resolvedSessionId = resolvedSessionId.toUpperCase();
              sessionRef = doc(db, "sessions", resolvedSessionId);
            }
          }

          if (!sessionSnap.exists()) {
            throw new Error("Session not found");
          }

          const sessionData = sessionSnap.data();
          
          if (sessionData.status === 'closed') {
            alert("Bài kiểm tra này đã đóng.");
            handleReturnToRoleSelection();
            return;
          }

          const versionsRef = collection(db, "sessions", resolvedSessionId, "versions");
          const versionsSnap = await getDocs(versionsRef);
          const versions = versionsSnap.docs.map(doc => doc.data());

          const fullSessionData = {
            config: sessionData.config,
            teacherPassword: sessionData.teacherPassword,
            versions: versions
          };

          setSessionId(resolvedSessionId);
          await loadSessionFromData(fullSessionData);
          return;
        } catch (error) {
          console.error("Failed to load session from URL:", error);
          alert(
            "Đường link không hợp lệ hoặc đã bị hỏng. Vui lòng kiểm tra lại.",
          );
          handleReturnToRoleSelection();
          handleFirestoreError(error, OperationType.GET, `sessions/${sessionParam}`);
          return;
        }
      }

      if (safeLocalStorage.getItem("testSessionData")) {
        const savedDataJSON = safeLocalStorage.getItem("testSessionData");
        if (savedDataJSON) {
          try {
            const savedData = JSON.parse(savedDataJSON);
            const loadedVersions = new Map<string, TestVersion>();
            for (const v of savedData.versions) {
               const parsedVersion: any = {
                 id: v.id,
                 correctAnswers: v.correctAnswers,
                 isAIGenerated: v.isAIGenerated || !!v.testContent
               };
               if (v.testContent) {
                  parsedVersion.testContent = v.testContent;
               }
               if (v.testFileDataUrl && v.testFileName) {
                  parsedVersion.testFile = dataURLtoFile(v.testFileDataUrl, v.testFileName);
               }
               if (v.answerKeyFileDataUrl && v.answerKeyFileName) {
                  parsedVersion.answerKeyFile = dataURLtoFile(
                    v.answerKeyFileDataUrl,
                    v.answerKeyFileName,
                  );
               }
               loadedVersions.set(v.id, parsedVersion);
            }
            setTestVersions(loadedVersions);
            setNumMultipleChoice(savedData.config.mc);
            setNumTrueFalse(savedData.config.tf);
            setNumShortAnswer(savedData.config.sa || 0);
            setNumFreeResponse(savedData.config.fr);
            setTestDuration(savedData.config.duration);
            setTestName(savedData.config.testName || "");
            setTestStartTime(savedData.config.startTime || "");
            setTestEndTime(savedData.config.endTime || "");
            setScoreConfig(savedData.config.scoreConfig || { mcPoints: 0.25, tfPoints: 0.25, saPoints: 0.25, frPoints: 1.0, totalScore: 10, allowMultipleAttempts: false });
            setAllowedStudents(savedData.config.allowedStudents || []);
            setAdditionalStudentFields(savedData.config.additionalStudentFields || []);
            setTeacherPassword(savedData.teacherPassword);
          } catch (error) {
            console.error("Failed to load saved session:", error);
            safeLocalStorage.removeItem("testSessionData");
          }
        }
      }
      const savedResultsJSON = safeLocalStorage.getItem("studentResults");
      if (savedResultsJSON) {
        try {
          setAllStudentResults(JSON.parse(savedResultsJSON));
        } catch (error) {
          safeLocalStorage.removeItem("studentResults");
        }
      }
    };

    initializeApp();
  }, [dataURLtoFile, loadSessionFromData, handleReturnToRoleSelection]);

  useEffect(() => {
    if (sessionId && currentRole === "teacher") {
      const resultsRef = collection(db, "sessions", sessionId, "results");
      const unsubscribeResults = onSnapshot(resultsRef, (snapshot) => {
        const results: StudentResult[] = [];
        snapshot.forEach((doc) => {
          results.push({ id: doc.id, ...doc.data() } as StudentResult);
        });
        setAllStudentResults(results);
      }, (error) => {
        console.error("Error fetching results:", error);
        handleFirestoreError(error, OperationType.GET, `sessions/${sessionId}/results`);
      });

      const participantsRef = collection(db, "sessions", sessionId, "participants");
      const unsubscribeParticipants = onSnapshot(participantsRef, (snapshot) => {
        const participants: any[] = [];
        snapshot.forEach((doc) => {
          participants.push({ id: doc.id, ...doc.data() });
        });
        setActiveParticipants(participants);
      }, (error) => {
        console.error("Error fetching participants:", error);
        handleFirestoreError(error, OperationType.GET, `sessions/${sessionId}/participants`);
      });

      return () => {
        unsubscribeResults();
        unsubscribeParticipants();
      };
    }
  }, [sessionId, currentRole]);

  const handleStartWithRole = useCallback((role: "teacher" | "student") => {
    const proceed = () => {
      setViolationCount(0);
      setCurrentRole(role);
      if (role === "student") {
        setAppState(AppState.STUDENT_UPLOAD_SESSION);
      } else if (auth.currentUser && currentUser) {
        if (currentUser.role === 'admin' || currentUser.role === 'teacher') {
          setAppState(AppState.TEACHER_DASHBOARD);
        } else if (currentUser.role === 'locked') {
          setAppState(AppState.LOCKED);
        } else {
          setAppState(AppState.PENDING_APPROVAL);
        }
      } else {
        setAppState(AppState.TEACHER_LOGIN);
      }
    };

    const docEl = document.documentElement as any;
    const requestFS =
      docEl.requestFullscreen ||
      docEl.webkitRequestFullscreen ||
      docEl.mozRequestFullScreen ||
      docEl.msRequestFullscreen;

    if (requestFS) {
      try {
        const promise = requestFS.call(docEl);
        if (promise && promise.catch) {
          promise
            .catch((err: any) => {
              console.log(
                `Không thể tự động vào chế độ toàn màn hình: ${err.message}`,
              );
            })
            .finally(proceed);
        } else {
          proceed();
        }
      } catch (err) {
        console.log(`Lỗi khi gọi requestFullscreen:`, err);
        proceed();
      }
    } else {
      console.log("Trình duyệt không hỗ trợ chế độ toàn màn hình.");
      proceed();
    }
  }, []);

  useEffect(() => {
    if (appState === AppState.TEACHER_LOGIN && currentUser) {
      if (currentUser.role === 'admin' || currentUser.role === 'teacher') {
        setAppState(AppState.TEACHER_DASHBOARD);
      } else if (currentUser.role === 'locked') {
        setAppState(AppState.LOCKED);
      } else {
        setAppState(AppState.PENDING_APPROVAL);
      }
    }
  }, [appState, currentUser]);

  const handleLoginSuccess = useCallback(
    (user: Pick<User, "username" | "role">) => {
      // Handled by useEffect above
    },
    [],
  );

  const getSessionDataAsObject = useCallback(
    async (
      versionsParam?: { id: string; testFile?: File; answerKeyFile?: File; correctAnswers?: any; testContent?: string; isAIGenerated?: boolean }[],
      mcParam?: number,
      tfParam?: number,
      saParam?: number,
      frParam?: number,
      durationParam?: number,
      passwordParam?: string,
      testNameParam?: string,
      startTimeParam?: string,
      endTimeParam?: string,
      scoreConfigParam?: ScoreConfig,
      allowedStudentsParam?: {studentId: string; name: string; class: string; additionalData?: Record<string, string>}[],
      additionalStudentFieldsParam?: string[],
    ) => {
      let finalVersions: TestVersion[] = [];

      if (versionsParam) {
        finalVersions = await Promise.all(
          versionsParam.map(async (v: any) => {
            const correctAnswers = v.correctAnswers || (v.answerKeyFile ? await parseAnswerKey(v.answerKeyFile) : undefined);
            return {
              ...v,
              correctAnswers: correctAnswers || {},
            };
          }),
        );
      } else {
        if (testVersions.size === 0) {
          alert("Vui lòng thêm ít nhất một mã đề trước khi tạo file.");
          return null;
        }
        finalVersions = Array.from(testVersions.values());
      }

      const serializableVersions = await Promise.all(
        finalVersions.map(async (v: TestVersion) => {
           const base: any = {
             id: v.id,
             correctAnswers: v.correctAnswers,
             isAIGenerated: v.isAIGenerated || !!v.testContent
           };
           if (v.testContent) base.testContent = v.testContent;
           if (v.testFile && v.testFile.name) {
              base.testFileDataUrl = await fileToDataURL(v.testFile);
              base.testFileName = v.testFile.name;
           }
           if (v.answerKeyFile && v.answerKeyFile.name) {
              base.answerKeyFileDataUrl = await fileToDataURL(v.answerKeyFile);
              base.answerKeyFileName = v.answerKeyFile.name;
           }
           return base;
        })
      );
      return {
        versions: serializableVersions,
        config: {
          mc: mcParam !== undefined ? mcParam : numMultipleChoice,
          tf: tfParam !== undefined ? tfParam : numTrueFalse,
          sa: saParam !== undefined ? saParam : numShortAnswer,
          fr: frParam !== undefined ? frParam : numFreeResponse,
          duration: durationParam !== undefined ? durationParam : testDuration,
          testName: testNameParam !== undefined ? testNameParam : testName,
          startTime: startTimeParam !== undefined ? startTimeParam : testStartTime,
          endTime: endTimeParam !== undefined ? endTimeParam : testEndTime,
          scoreConfig: scoreConfigParam !== undefined ? scoreConfigParam : scoreConfig,
          allowedStudents: allowedStudentsParam !== undefined ? allowedStudentsParam : allowedStudents,
          additionalStudentFields: additionalStudentFieldsParam !== undefined ? additionalStudentFieldsParam : additionalStudentFields,
        },
        teacherPassword:
          passwordParam !== undefined ? passwordParam : teacherPassword,
      };
    },
    [
      testVersions,
      fileToDataURL,
      numMultipleChoice,
      numTrueFalse,
      numShortAnswer,
      numFreeResponse,
      testDuration,
      testName,
      testStartTime,
      testEndTime,
      scoreConfig,
      teacherPassword,
    ],
  );

  const migrateSessionInFirestore = async (oldSessionId: string, newSessionId: string) => {
    const oldSessionRef = doc(db, "sessions", oldSessionId);
    const oldDocSnap = await getDoc(oldSessionRef);
    if (!oldDocSnap.exists()) return;

    const sessionData = oldDocSnap.data();
    const newSessionRef = doc(db, "sessions", newSessionId);

    const [versionsSnap, resultsSnap, participantsSnap] = await Promise.all([
      getDocs(collection(db, "sessions", oldSessionId, "versions")),
      getDocs(collection(db, "sessions", oldSessionId, "results")),
      getDocs(collection(db, "sessions", oldSessionId, "participants")),
    ]);

    await setDoc(newSessionRef, sessionData);

    const copyVersionPromises = versionsSnap.docs.map(vDoc =>
      setDoc(doc(db, "sessions", newSessionId, "versions", vDoc.id), vDoc.data())
    );
    await Promise.all(copyVersionPromises);

    const copyResultPromises = resultsSnap.docs.map(rDoc => {
      const rData = rDoc.data();
      if (rData.sessionId) rData.sessionId = newSessionId;
      return setDoc(doc(db, "sessions", newSessionId, "results", rDoc.id), rData);
    });
    await Promise.all(copyResultPromises);

    const copyParticipantPromises = participantsSnap.docs.map(pDoc =>
      setDoc(doc(db, "sessions", newSessionId, "participants", pDoc.id), pDoc.data())
    );
    await Promise.all(copyParticipantPromises);

    const deletePromises = [
      ...versionsSnap.docs.map(vDoc => deleteDoc(doc(db, "sessions", oldSessionId, "versions", vDoc.id))),
      ...resultsSnap.docs.map(rDoc => deleteDoc(doc(db, "sessions", oldSessionId, "results", rDoc.id))),
      ...participantsSnap.docs.map(pDoc => deleteDoc(doc(db, "sessions", oldSessionId, "participants", pDoc.id))),
      deleteDoc(oldSessionRef),
    ];
    await Promise.all(deletePromises);
  };

  const handleTeacherSetupComplete = useCallback(
    async (
      versions: { id: string; testFile?: File; answerKeyFile?: File; correctAnswers?: any; testContent?: string; isAIGenerated?: boolean }[],
      mc: number,
      tf: number,
      sa: number,
      fr: number,
      password: string,
      duration: number,
      name: string,
      startTime: string,
      endTime: string,
      scoreConfigParam: ScoreConfig,
      allowedStudentsParam?: {studentId: string; name: string; class: string; additionalData?: Record<string, string>}[],
      additionalStudentFieldsParam?: string[],
      customSessionIdParam?: string,
    ) => {
      try {
        setIsStudentSession(false);
        await handleSetupSession(
          versions,
          mc,
          tf,
          sa,
          fr,
          password,
          duration,
          name,
          startTime,
          endTime,
          scoreConfigParam,
          true,
          allowedStudentsParam,
          additionalStudentFieldsParam
        );
        
        // Save to Firestore if authenticated
        if (auth.currentUser) {
          const dataToExport = await getSessionDataAsObject(
            versions,
            mc,
            tf,
            sa,
            fr,
            duration,
            password,
            name,
            startTime,
            endTime,
            scoreConfigParam,
            allowedStudentsParam,
            additionalStudentFieldsParam
          );
          if (dataToExport) {
            let targetSessionId = sessionId;
            const cleanCustomId = customSessionIdParam ? sanitizeSessionCode(customSessionIdParam).toUpperCase() : "";

            if (cleanCustomId) {
              if (!isValidSessionCode(cleanCustomId)) {
                alert("Mã phiên kiểm tra phải từ 3 đến 50 ký tự gồm chữ cái, chữ số, dấu '-' hoặc '_'.");
                return;
              }
              if (!sessionId) {
                const checkSnap = await getDoc(doc(db, "sessions", cleanCustomId));
                if (checkSnap.exists()) {
                  alert(`Mã phiên kiểm tra "${cleanCustomId}" đã tồn tại. Vui lòng chọn mã khác.`);
                  return;
                }
                targetSessionId = cleanCustomId;
              } else if (sessionId !== cleanCustomId) {
                const checkSnap = await getDoc(doc(db, "sessions", cleanCustomId));
                if (checkSnap.exists()) {
                  alert(`Mã phiên kiểm tra "${cleanCustomId}" đã tồn tại. Vui lòng chọn mã khác.`);
                  return;
                }
                await migrateSessionInFirestore(sessionId, cleanCustomId);
                targetSessionId = cleanCustomId;
              }
            }

            if (!targetSessionId) {
              const sessionRef = doc(collection(db, "sessions"));
              targetSessionId = sessionRef.id;
            }
            setSessionId(targetSessionId);

            const sessionRef = doc(db, "sessions", targetSessionId);
            const sessionDataToSave: any = {
              teacherId: auth.currentUser.uid,
              config: dataToExport.config,
              teacherPassword: dataToExport.teacherPassword || "",
              status: "active",
              versionIds: dataToExport.versions.map((v: any) => v.id)
            };
            
            if (!sessionId) {
              sessionDataToSave.createdAt = new Date().toISOString();
            }

            await setDoc(sessionRef, sessionDataToSave, { merge: true });

            // Save versions to subcollection concurrently
            const versionSavePromises = dataToExport.versions.map((v: any) => {
              const versionRef = doc(db, "sessions", targetSessionId, "versions", v.id);
              const versionDataToSave: any = {
                id: v.id,
                correctAnswers: v.correctAnswers,
                isAIGenerated: v.isAIGenerated || !!v.testContent
              };
              if (v.testContent) {
                 versionDataToSave.testContent = v.testContent;
              }
               if (v.testFileDataUrl && v.testFileName) {
                   versionDataToSave.testFileDataUrl = v.testFileDataUrl;
                   versionDataToSave.testFileName = v.testFileName;
               }
               if (v.answerKeyFileDataUrl && v.answerKeyFileName) {
                   versionDataToSave.answerKeyFileDataUrl = v.answerKeyFileDataUrl;
                   versionDataToSave.answerKeyFileName = v.answerKeyFileName;
               }
    
              return setDoc(versionRef, versionDataToSave);
            });
            
            await Promise.all(versionSavePromises);
          }
        }

        setAppState(AppState.TEACHER_DASHBOARD);
      } catch (e) {
        alert(
          "Đã xảy ra lỗi khi lưu cấu hình bài kiểm tra (có thể do file đáp án lỗi). Vui lòng kiểm tra lại.",
        );
        setAppState(AppState.TEACHER_SETUP);
        handleFirestoreError(e, OperationType.WRITE, `sessions`);
      }
    },
    [handleSetupSession, getSessionDataAsObject, sessionId],
  );

  const handleStudentLoadSessionFromId = useCallback(async (selectedSessionId: string) => {
    let targetId = selectedSessionId.trim();
    setSessionId(targetId);
    setAppState(AppState.LOADING_SESSION_FROM_URL);
    try {
      let sessionRef = doc(db, "sessions", targetId);
      let sessionSnap = await getDoc(sessionRef);
      
      if (!sessionSnap.exists() && targetId !== targetId.toUpperCase()) {
        const upperSnap = await getDoc(doc(db, "sessions", targetId.toUpperCase()));
        if (upperSnap.exists()) {
          sessionSnap = upperSnap;
          targetId = targetId.toUpperCase();
          sessionRef = doc(db, "sessions", targetId);
          setSessionId(targetId);
        }
      }

      if (!sessionSnap.exists()) {
        alert("Không tìm thấy phiên làm bài với mã này.");
        setSessionId("");
        setAppState(AppState.STUDENT_UPLOAD_SESSION);
        return;
      }

      const sessionData = sessionSnap.data();
      if (!sessionData || !sessionData.config) {
        alert("Dữ liệu phiên làm bài không hợp lệ.");
        setSessionId("");
        setAppState(AppState.STUDENT_UPLOAD_SESSION);
        return;
      }
      
      const versionsRef = collection(db, "sessions", selectedSessionId, "versions");
      const versionsSnap = await getDocs(versionsRef);
      
      if (versionsSnap.empty) {
        alert("Phiên làm bài này không có mã đề nào.");
        setSessionId("");
        setAppState(AppState.STUDENT_UPLOAD_SESSION);
        return;
      }

      const versions = versionsSnap.docs.map(doc => doc.data());

      const dataToLoad = {
        versions: versions,
        config: sessionData.config,
        teacherPassword: sessionData.teacherPassword || ""
      };

      await loadSessionFromData(dataToLoad);
    } catch (error) {
      console.error("Failed to load session:", error);
      alert("Đã có lỗi xảy ra khi tải phiên làm bài. Vui lòng thử lại.");
      setSessionId("");
      setAppState(AppState.STUDENT_UPLOAD_SESSION);
      handleFirestoreError(error, OperationType.GET, `sessions/${selectedSessionId}`);
    }
  }, [loadSessionFromData]);

  const handleImportSession = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string;
          const data = JSON.parse(text);
          await loadSessionFromData(data);
        } catch (error) {
          console.error("Failed to import session:", error);
          alert("Tệp phiên làm bài không hợp lệ hoặc đã bị hỏng.");
        }
      };
      reader.readAsText(file);
    },
    [loadSessionFromData],
  );



  const handleExportSession = useCallback(
    async (
      versions?: { id: string; testFile?: File; answerKeyFile?: File; correctAnswers?: any; testContent?: string; isAIGenerated?: boolean }[],
      mc?: number,
      tf?: number,
      sa?: number,
      fr?: number,
      duration?: number,
      password?: string,
      name?: string,
      startTime?: string,
      endTime?: string,
      scoreConfigParam?: ScoreConfig,
      allowedStudentsParam?: {studentId: string; name: string; class: string; additionalData?: Record<string, string>}[],
      additionalStudentFieldsParam?: string[],
      customSessionIdParam?: string,
    ) => {
      try {
        const dataToExport = await getSessionDataAsObject(
          versions,
          mc,
          tf,
          sa,
          fr,
          duration,
          password,
          name,
          startTime,
          endTime,
          scoreConfigParam,
          allowedStudentsParam,
          additionalStudentFieldsParam,
        );
        if (!dataToExport) return;

        const jsonString = JSON.stringify(dataToExport);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        const codeForFile = sessionId || (customSessionIdParam ? sanitizeSessionCode(customSessionIdParam).toUpperCase() : "");
        const filename = codeForFile ? `${codeForFile}.testsession` : (name ? `${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${date}.testsession` : `PhienLamBai_${date}.testsession`);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(
          "Đã tạo file cho học sinh thành công! Hãy chia sẻ file vừa tải về.",
        );
      } catch (error) {
        console.error("Failed to export session:", error);
        alert("Đã có lỗi xảy ra khi tạo file phiên làm bài.");
      }
    },
    [getSessionDataAsObject, sessionId],
  );

  const handleCreateShareableLink = useCallback(
    async (
      versions?: { id: string; testFile?: File; answerKeyFile?: File; correctAnswers?: any; testContent?: string; isAIGenerated?: boolean }[],
      mc?: number,
      tf?: number,
      sa?: number,
      fr?: number,
      duration?: number,
      password?: string,
      name?: string,
      startTime?: string,
      endTime?: string,
      scoreConfigParam?: ScoreConfig,
      allowedStudentsParam?: {studentId: string; name: string; class: string; additionalData?: Record<string, string>}[],
      additionalStudentFieldsParam?: string[],
      customSessionIdParam?: string,
    ) => {
      if (!auth.currentUser) {
        alert("Vui lòng đăng nhập để tạo link chia sẻ.");
        return;
      }

      try {
        const dataToExport = await getSessionDataAsObject(
          versions,
          mc,
          tf,
          sa,
          fr,
          duration,
          password,
          name,
          startTime,
          endTime,
          scoreConfigParam,
          allowedStudentsParam,
          additionalStudentFieldsParam,
        );
        if (!dataToExport) return;

        // Save to Firestore
        let targetSessionId = sessionId;
        const cleanCustomId = customSessionIdParam ? sanitizeSessionCode(customSessionIdParam).toUpperCase() : "";

        if (cleanCustomId) {
          if (!isValidSessionCode(cleanCustomId)) {
            alert("Mã phiên kiểm tra phải từ 3 đến 50 ký tự gồm chữ cái, chữ số, dấu '-' hoặc '_'.");
            return;
          }
          if (!sessionId) {
            const checkSnap = await getDoc(doc(db, "sessions", cleanCustomId));
            if (checkSnap.exists()) {
              alert(`Mã phiên kiểm tra "${cleanCustomId}" đã tồn tại. Vui lòng chọn mã khác.`);
              return;
            }
            targetSessionId = cleanCustomId;
          } else if (sessionId !== cleanCustomId) {
            const checkSnap = await getDoc(doc(db, "sessions", cleanCustomId));
            if (checkSnap.exists()) {
              alert(`Mã phiên kiểm tra "${cleanCustomId}" đã tồn tại. Vui lòng chọn mã khác.`);
              return;
            }
            await migrateSessionInFirestore(sessionId, cleanCustomId);
            targetSessionId = cleanCustomId;
          }
        }

        if (!targetSessionId) {
          const sessionRef = doc(collection(db, "sessions"));
          targetSessionId = sessionRef.id;
        }
        setSessionId(targetSessionId);

        const sessionRef = doc(db, "sessions", targetSessionId);
        const sessionDataToSave: any = {
          teacherId: auth.currentUser.uid,
          config: dataToExport.config,
          teacherPassword: dataToExport.teacherPassword || "",
          status: "active"
        };
        
        if (!sessionId) {
          sessionDataToSave.createdAt = new Date().toISOString();
        }

        await setDoc(sessionRef, sessionDataToSave, { merge: true });

        // Save versions to subcollection
        for (const v of dataToExport.versions) {
          const versionRef = doc(db, "sessions", targetSessionId, "versions", v.id);
          const versionDataToSave: any = {
            id: v.id,
            correctAnswers: v.correctAnswers,
            isAIGenerated: v.isAIGenerated || !!v.testContent
          };
          if (v.testContent) {
             versionDataToSave.testContent = v.testContent;
          }
           if (v.testFileDataUrl && v.testFileName) {
               versionDataToSave.testFileDataUrl = v.testFileDataUrl;
               versionDataToSave.testFileName = v.testFileName;
           }
           if (v.answerKeyFileDataUrl && v.answerKeyFileName) {
               versionDataToSave.answerKeyFileDataUrl = v.answerKeyFileDataUrl;
               versionDataToSave.answerKeyFileName = v.answerKeyFileName;
           }

          await setDoc(versionRef, versionDataToSave);
        }

        const currentUrl = new URL(window.location.href);
        currentUrl.search = "";
        currentUrl.hash = "";
        currentUrl.searchParams.set("session", targetSessionId);
        const fullUrl = currentUrl.href;

        setShareLink(fullUrl);
        setIsShareLinkModalOpen(true);
      } catch (error) {
        console.error("Failed to create shareable link:", error);
        alert("Đã có lỗi xảy ra khi tạo link chia sẻ.");
        handleFirestoreError(error, OperationType.WRITE, `sessions`);
      }
    },
    [getSessionDataAsObject, sessionId],
  );

  const handleStudentStart = useCallback(
    async (name: string, aClass: string, studentId: string, additionalData?: Record<string, string>) => {
      if (testVersions.size === 0) {
        showAlert("Chưa có mã đề nào được cấu hình. Vui lòng liên hệ giáo viên.");
        return;
      }

      const isDuplicate = allStudentResults.some(result => result.studentId === studentId);
      if (isDuplicate && !scoreConfig.allowMultipleAttempts) {
        showAlert("Số báo danh/Mã học sinh này đã nộp bài trong phiên kiểm tra này. Vui lòng kiểm tra lại.");
        return;
      }

      const now = new Date();
      if (testStartTime) {
        const startTime = new Date(testStartTime);
        if (now < startTime) {
          showAlert(`Bài kiểm tra chưa mở. Thời gian mở: ${startTime.toLocaleString()}`);
          return;
        }
      }

      if (testEndTime) {
        const endTime = new Date(testEndTime);
        if (now > endTime) {
          showAlert(`Bài kiểm tra đã đóng lúc: ${endTime.toLocaleString()}`);
          return;
        }
      }

      if (sessionId) {
        try {
          const sessionRef = doc(db, "sessions", sessionId);
          const sessionSnap = await getDoc(sessionRef);
          if (sessionSnap.exists()) {
            const data = sessionSnap.data();
            if (data.status === 'closed') {
              showAlert("Bài kiểm tra này đã bị giáo viên đóng.");
              handleReturnToRoleSelection();
              return;
            }
          }
        } catch (error) {
          console.error("Error checking session status:", error);
        }
      }

      const versionIds = Array.from(testVersions.keys());
      let poolToSelectFrom = versionIds;

      const randomIndex = Math.floor(Math.random() * poolToSelectFrom.length);
      const randomTestVersionId = poolToSelectFrom[randomIndex];

      setCurrentStudent({
        name,
        class: aClass,
        studentId,
        additionalData: additionalData || {},
        answers: {},
        testVersionId: randomTestVersionId,
      });
      setIsFocusWarningModalOpen(true);
    },
    [testVersions, testStartTime, testEndTime, sessionId, handleReturnToRoleSelection, allStudentResults],
  );

  const enterFullscreen = useCallback(() => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    }
  }, []);

  const confirmStartTest = useCallback(async () => {
    setIsFocusWarningModalOpen(false);
    enterFullscreen();

    if (numMultipleChoice > 0) {
      setViewingSection("mc");
    } else if (numTrueFalse > 0) {
      setViewingSection("tf");
    } else if (numShortAnswer > 0) {
      setViewingSection("sa");
    } else if (numFreeResponse > 0) {
      setViewingSection("fr");
    } else {
      setViewingSection("all");
    }

    if (sessionId && currentStudent) {
      try {
        const safeStudentId = currentStudent.studentId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const participantRef = doc(db, "sessions", sessionId, "participants", safeStudentId);
        await setDoc(participantRef, {
          name: currentStudent.name,
          class: currentStudent.class,
          studentId: currentStudent.studentId,
          additionalData: currentStudent.additionalData || {},
          testVersionId: currentStudent.testVersionId,
          joinTime: new Date().toISOString()
        }, { merge: true });
      } catch (error) {
        console.error("Failed to register participant:", error);
      }
    }

    setAppState(AppState.TEST_TAKING);
  }, [numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, enterFullscreen, sessionId, currentStudent]);

  const handleGoToNextSection = useCallback(() => {
    if (viewingSection === "mc") {
      if (numTrueFalse > 0) setViewingSection("tf");
      else if (numShortAnswer > 0) setViewingSection("sa");
      else if (numFreeResponse > 0) setViewingSection("fr");
      else setViewingSection("all");
    } else if (viewingSection === "tf") {
      if (numShortAnswer > 0) setViewingSection("sa");
      else if (numFreeResponse > 0) setViewingSection("fr");
      else setViewingSection("all");
    } else if (viewingSection === "sa") {
      if (numFreeResponse > 0) setViewingSection("fr");
      else setViewingSection("all");
    } else if (viewingSection === "fr") {
      setViewingSection("all");
    }
  }, [viewingSection, numTrueFalse, numShortAnswer, numFreeResponse]);

  const handleGoToPreviousSection = useCallback(() => {
    if (viewingSection === "all") {
      if (numFreeResponse > 0) setViewingSection("fr");
      else if (numShortAnswer > 0) setViewingSection("sa");
      else if (numTrueFalse > 0) setViewingSection("tf");
      else if (numMultipleChoice > 0) setViewingSection("mc");
    } else if (viewingSection === "fr") {
      if (numShortAnswer > 0) setViewingSection("sa");
      else if (numTrueFalse > 0) setViewingSection("tf");
      else if (numMultipleChoice > 0) setViewingSection("mc");
    } else if (viewingSection === "sa") {
      if (numTrueFalse > 0) setViewingSection("tf");
      else if (numMultipleChoice > 0) setViewingSection("mc");
    } else if (viewingSection === "tf") {
      if (numMultipleChoice > 0) setViewingSection("mc");
    }
  }, [
    viewingSection,
    numMultipleChoice,
    numTrueFalse,
    numShortAnswer,
    numFreeResponse,
  ]);

  const handleStudentProceedToEntry = useCallback(() => {
    enterFullscreen();
    setAppState(AppState.TEST_TAKING);
  }, [enterFullscreen]);

  const handleStudentAnswerChange = useCallback(
    (question: string, answer: string) => {
      setCurrentStudent((prev) =>
        prev
          ? { ...prev, answers: { ...prev.answers, [question]: answer } }
          : null,
      );
    },
    [],
  );

  const handleFinishSession = useCallback(async () => {
    if (sessionId && auth.currentUser) {
      try {
        const sessionRef = doc(db, "sessions", sessionId);
        await setDoc(sessionRef, { status: "closed" }, { merge: true });
      } catch (error) {
        console.error("Error closing session:", error);
        handleFirestoreError(error, OperationType.UPDATE, `sessions/${sessionId}`);
      }
    }
    setAppState(AppState.ALL_RESULTS);
  }, [sessionId]);

  const handleEditStudentId = useCallback(async (oldResultId: string, newStudentId: string) => {
    if (!sessionId) return;
    try {
      const safeNewId = newStudentId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const newResultRef = doc(db, "sessions", sessionId, "results", safeNewId);
      const oldResultRef = doc(db, "sessions", sessionId, "results", oldResultId);

      // Check if new ID already exists
      const newDocSnap = await getDoc(newResultRef);
      if (newDocSnap.exists()) {
        alert("Số báo danh/Mã học sinh mới đã tồn tại trong hệ thống!");
        return;
      }

      // Get old data
      const oldDocSnap = await getDoc(oldResultRef);
      if (!oldDocSnap.exists()) {
        alert("Không tìm thấy bài nộp cũ.");
        return;
      }

      const data = oldDocSnap.data();
      data.studentId = newStudentId;

      const batch = writeBatch(db);
      batch.set(newResultRef, data);
      batch.delete(oldResultRef);
      await batch.commit();

      alert("Sửa số báo danh thành công!");
    } catch (error) {
      console.error("Error editing student ID:", error);
      handleFirestoreError(error, OperationType.UPDATE, `sessions/${sessionId}/results`);
    }
  }, [sessionId]);

  const handleDeleteStudentResult = useCallback(async (resultId: string) => {
    if (!sessionId) return;
    try {
      await deleteDoc(doc(db, "sessions", sessionId, "results", resultId));
    } catch (error) {
      console.error("Error deleting student result:", error);
      handleFirestoreError(error, OperationType.DELETE, `sessions/${sessionId}/results/${resultId}`);
    }
  }, [sessionId]);

  const handleDeleteActiveParticipant = useCallback(async (participantId: string) => {
    if (!sessionId) return;
    try {
      await deleteDoc(doc(db, "sessions", sessionId, "participants", participantId));
    } catch (error) {
      console.error("Error deleting active participant:", error);
      handleFirestoreError(error, OperationType.DELETE, `sessions/${sessionId}/participants/${participantId}`);
    }
  }, [sessionId]);

  const handleDeleteMultipleStudentResults = useCallback(async (resultIds: string[]) => {
    if (!sessionId) return;
    try {
      const batch = writeBatch(db);
      resultIds.forEach((id) => {
        batch.delete(doc(db, "sessions", sessionId, "results", id));
      });
      await batch.commit();
    } catch (error) {
      console.error("Error deleting multiple student results:", error);
      handleFirestoreError(error, OperationType.DELETE, `sessions/${sessionId}/results/batch`);
    }
  }, [sessionId]);

  const handleResetToSetupKeepFiles = useCallback(() => {
    setCurrentStudent(null);
    setLastStudentResult(null);
    setAppState(AppState.TEACHER_SETUP);
  }, []);

  const handleCreateNewSession = useCallback(() => {
    setTestVersions(new Map());
    setNumMultipleChoice(40);
    setNumTrueFalse(0);
    setNumShortAnswer(0);
    setNumFreeResponse(0);
    setTestDuration(50);
    setTestName("");
    setTestStartTime("");
    setTestEndTime("");
    setTeacherPassword("");
    setSessionId(null);
    setAllStudentResults([]);
    setAppState(AppState.TEACHER_SETUP);
  }, []);

  const handleLoadSessionFromDashboard = useCallback(async (selectedSessionId: string) => {
    setAppState(AppState.LOADING_SESSION_FROM_URL);
    try {
      const sessionRef = doc(db, "sessions", selectedSessionId);
      const sessionSnap = await getDoc(sessionRef);
      
      if (!sessionSnap.exists()) {
        throw new Error("Session not found");
      }

      const sessionData = sessionSnap.data();
      
      const versionsRef = collection(db, "sessions", selectedSessionId, "versions");
      const versionsSnap = await getDocs(versionsRef);
      const versions = versionsSnap.docs.map(doc => doc.data());

      const loadedVersions = new Map<string, TestVersion>();
      for (const v of versions) {
        let parsedTestFile = undefined;
        let parsedAnswerKeyFile = undefined;
        
        if (v.testFileDataUrl && v.testFileName) {
            parsedTestFile = dataURLtoFile(v.testFileDataUrl, v.testFileName);
        }
        if (v.answerKeyFileDataUrl && v.answerKeyFileName) {
            parsedAnswerKeyFile = dataURLtoFile(v.answerKeyFileDataUrl, v.answerKeyFileName);
        }

        loadedVersions.set(v.id, {
          id: v.id,
          testFile: parsedTestFile,
          answerKeyFile: parsedAnswerKeyFile,
          testContent: v.testContent,
          correctAnswers: v.correctAnswers,
          isAIGenerated: v.isAIGenerated || !!v.testContent
        });
      }

      setTestVersions(loadedVersions);
      setNumMultipleChoice(sessionData.config.mc);
      setNumTrueFalse(sessionData.config.tf);
      setNumShortAnswer(sessionData.config.sa || 0);
      setNumFreeResponse(sessionData.config.fr);
      setTestDuration(sessionData.config.duration);
      setTestName(sessionData.config.testName || "");
      setTestStartTime(sessionData.config.startTime || "");
      setTestEndTime(sessionData.config.endTime || "");
      setScoreConfig(sessionData.config.scoreConfig || { mcPoints: 0.25, tfPoints: 0.25, saPoints: 0.25, frPoints: 1.0, totalScore: 10, allowMultipleAttempts: false });
      setAllowedStudents(sessionData.config.allowedStudents || []);
      setAdditionalStudentFields(sessionData.config.additionalStudentFields || []);
      setTeacherPassword(sessionData.teacherPassword);
      setSessionId(selectedSessionId);
      setIsStudentSession(false);
      setAppState(AppState.TEACHER_SETUP);
    } catch (error) {
      console.error("Failed to load session:", error);
      alert("Đã có lỗi xảy ra khi tải phiên làm bài.");
      setAppState(AppState.TEACHER_DASHBOARD);
      handleFirestoreError(error, OperationType.GET, `sessions/${selectedSessionId}`);
    }
  }, [dataURLtoFile]);

  const handleViewResultsFromDashboard = useCallback(async (selectedSessionId: string) => {
    setAppState(AppState.LOADING_SESSION_FROM_URL);
    try {
      const sessionRef = doc(db, "sessions", selectedSessionId);
      const sessionSnap = await getDoc(sessionRef);
      
      if (!sessionSnap.exists()) {
        throw new Error("Session not found");
      }

      const sessionData = sessionSnap.data();
      
      const versionsRef = collection(db, "sessions", selectedSessionId, "versions");
      const versionsSnap = await getDocs(versionsRef);
      const versions = versionsSnap.docs.map(doc => doc.data());

      const loadedVersions = new Map<string, TestVersion>();
      for (const v of versions) {
        let parsedTestFile = undefined;
        let parsedAnswerKeyFile = undefined;
        
        if (v.testFileDataUrl && v.testFileName) {
            parsedTestFile = dataURLtoFile(v.testFileDataUrl, v.testFileName);
        }
        if (v.answerKeyFileDataUrl && v.answerKeyFileName) {
            parsedAnswerKeyFile = dataURLtoFile(v.answerKeyFileDataUrl, v.answerKeyFileName);
        }

        loadedVersions.set(v.id, {
          id: v.id,
          testFile: parsedTestFile,
          answerKeyFile: parsedAnswerKeyFile,
          testContent: v.testContent,
          correctAnswers: v.correctAnswers,
          isAIGenerated: v.isAIGenerated || !!v.testContent
        });
      }

      setTestVersions(loadedVersions);
      setNumMultipleChoice(sessionData.config.mc);
      setNumTrueFalse(sessionData.config.tf);
      setNumShortAnswer(sessionData.config.sa || 0);
      setNumFreeResponse(sessionData.config.fr);
      setTestDuration(sessionData.config.duration);
      setTestName(sessionData.config.testName || "");
      setTestStartTime(sessionData.config.startTime || "");
      setTestEndTime(sessionData.config.endTime || "");
      setScoreConfig(sessionData.config.scoreConfig || { mcPoints: 0.25, tfPoints: 0.25, saPoints: 0.25, frPoints: 1.0, totalScore: 10, allowMultipleAttempts: false });
      setAllowedStudents(sessionData.config.allowedStudents || []);
      setAdditionalStudentFields(sessionData.config.additionalStudentFields || []);
      setTeacherPassword(sessionData.teacherPassword);
      setSessionId(selectedSessionId);
      setIsStudentSession(false);
      setAppState(AppState.ALL_RESULTS);
    } catch (error) {
      console.error("Failed to load session:", error);
      alert("Đã có lỗi xảy ra khi tải phiên làm bài.");
      setAppState(AppState.TEACHER_DASHBOARD);
      handleFirestoreError(error, OperationType.GET, `sessions/${selectedSessionId}`);
    }
  }, [dataURLtoFile]);

  const handleExportSessionFromDashboard = useCallback(async (selectedSessionId: string) => {
    try {
      const sessionRef = doc(db, "sessions", selectedSessionId);
      const sessionSnap = await getDoc(sessionRef);
      
      if (!sessionSnap.exists()) {
        throw new Error("Session not found");
      }

      const sessionData = sessionSnap.data();
      
      const versionsRef = collection(db, "sessions", selectedSessionId, "versions");
      const versionsSnap = await getDocs(versionsRef);
      const versions = versionsSnap.docs.map(doc => doc.data());

      const dataToExport = {
        versions: versions,
        config: sessionData.config,
        teacherPassword: sessionData.teacherPassword || ""
      };

      const jsonString = JSON.stringify(dataToExport);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = `${selectedSessionId}.testsession`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert("Đã tạo file cho học sinh thành công!");
    } catch (error) {
      console.error("Failed to export session:", error);
      alert("Đã có lỗi xảy ra khi tạo file phiên làm bài.");
      handleFirestoreError(error, OperationType.GET, `sessions/${selectedSessionId}`);
    }
  }, []);

  const handleExportAllResults = useCallback(() => {
    if (typeof window.XLSX === "undefined") {
      alert("Thư viện Excel (XLSX) chưa sẵn sàng. Vui lòng tải lại trang.");
      return;
    }
    const workbook = window.XLSX.utils.book_new();

    const autoGradedMaxScore = calculateMaxScore(
      numMultipleChoice,
      numTrueFalse,
      numShortAnswer,
      numFreeResponse,
      scoreConfig
    );

    const summaryHeaders = [
      "STT",
      "Số báo danh/Mã học sinh",
      "Họ và tên",
      "Lớp",
      ...additionalStudentFields,
      "Mã đề",
      "Thời gian nộp",
      `Điểm chấm tự động (/${autoGradedMaxScore.toFixed(1)})`,
      "Vi phạm",
      "Ghi chú",
    ];
    
    const summaryData = [summaryHeaders];
    allStudentResults.forEach((result, index) => {
      const correctAnswers = testVersions.get(
        result.testVersionId,
      )?.correctAnswers;
      if (!correctAnswers) return;
      const score = calculateScore(
        result.answers,
        correctAnswers,
        numMultipleChoice,
        numTrueFalse,
        numShortAnswer,
        numFreeResponse,
        scoreConfig
      );
      
      let note = "";
      if (result.submissionType === 'auto_violation') note = "Tự nộp (Vi phạm)";
      else if (result.submissionType === 'auto_visibility') note = "Tự nộp (Thoát màn hình)";
      else if (result.submissionType === 'auto_timeout') note = "Tự nộp (Hết giờ)";
      else if (numFreeResponse > 0) note = "Chưa tính điểm tự luận";

      const submissionTime = result.submissionTime
        ? new Date(result.submissionTime).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : "N/A";
        
      const record = [
        String(index + 1),
        result.studentId || "",
        result.name,
        result.class,
        ...additionalStudentFields.map(field => (result.additionalData && result.additionalData[field]) || ""),
        result.testVersionId,
        submissionTime,
        score.toFixed(2),
        String(result.violationCount || 0),
        note,
      ];
      summaryData.push(record);
    });
    const summaryWorksheet = window.XLSX.utils.aoa_to_sheet(summaryData);
    summaryWorksheet["!cols"] = [
      { wch: 5 },
      { wch: 30 },
      { wch: 15 },
      { wch: 10 },
      { wch: 25 },
      { wch: 30 },
      { wch: 35 },
    ];
    window.XLSX.utils.book_append_sheet(
      workbook,
      summaryWorksheet,
      "Tổng kết kết quả",
    );

    const listData: (string | number)[][] = [
      [
        "Tên bài kiểm tra",
        "Họ và tên",
        "Lớp",
        "Mã đề",
        "Câu hỏi",
        "Câu trả lời của HS",
        "Đáp án đúng",
        "Kết quả",
      ],
    ];
    const questionKeys = [
      ...Array.from({ length: numMultipleChoice }, (_, i) => `mc-${i + 1}`),
      ...Array.from({ length: numTrueFalse }, (_, i) => i + 1).flatMap((i) =>
        ["a", "b", "c", "d"].map((p) => `tf-${i}-${p}`),
      ),
      ...Array.from({ length: numShortAnswer }, (_, i) => `sa-${i + 1}`),
      ...Array.from({ length: numFreeResponse }, (_, i) => `fr-${i + 1}`),
    ];

    allStudentResults.forEach((result) => {
      const correctAnswers = testVersions.get(
        result.testVersionId,
      )?.correctAnswers;
      if (!correctAnswers) return;
      questionKeys.forEach((key) => {
        const studentAnswer = result.answers[key] || "";
        const normalizedKey = normalizeQuestionKey(key);
        const correctAnswer = correctAnswers[normalizedKey];
        let resultText = "";

        if (key.startsWith("fr-")) {
          resultText = "(Giáo viên chấm)";
        } else if (correctAnswer !== undefined) {
          // Logic check đúng sai
          if (key.startsWith("sa-")) {
            resultText =
              studentAnswer &&
              studentAnswer.trim().toLowerCase() ===
                String(correctAnswer).trim().toLowerCase()
                ? "Đúng"
                : "Sai";
          } else {
            resultText = studentAnswer
              ? normalizeAnswer(studentAnswer) ===
                normalizeAnswer(correctAnswer)
                ? "Đúng"
                : "Sai"
              : "Bỏ qua";
          }
        }
        listData.push([
          testName || "Không tên",
          result.name,
          result.class,
          result.testVersionId,
          key,
          studentAnswer,
          correctAnswer ?? "",
          resultText,
        ]);
      });
      if (allStudentResults.length > 1)
        listData.push(["", "", "", "", "", "", "", ""]);
    });
    const listWorksheet = window.XLSX.utils.aoa_to_sheet(listData);
    listWorksheet["!cols"] = [
      { wch: 20 },
      { wch: 30 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 25 },
      { wch: 25 },
      { wch: 15 },
    ];
    window.XLSX.utils.book_append_sheet(
      workbook,
      listWorksheet,
      "Chấm điểm chi tiết",
    );

    const filename = testName ? `tong_ket_${testName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.xlsx` : "tong_ket_ket_qua_lop.xlsx";
    window.XLSX.writeFile(workbook, filename);
  }, [
    allStudentResults,
    testVersions,
    numMultipleChoice,
    numTrueFalse,
    numShortAnswer,
    numFreeResponse,
    testName,
  ]);

  const handleExportStudentResult = useCallback(
    (result: StudentResult) => {
      if (typeof window.html2pdf === "undefined") {
        alert(
          "Thư viện tạo PDF (html2pdf) chưa tải xong hoặc gặp lỗi. Vui lòng tải lại trang.",
        );
        return;
      }

      const correctAnswers = testVersions.get(
        result.testVersionId,
      )?.correctAnswers;
      if (!correctAnswers) {
        alert(`Không tìm thấy đáp án cho mã đề ${result.testVersionId}`);
        return;
      }

      const score = calculateScore(
        result.answers,
        correctAnswers,
        numMultipleChoice,
        numTrueFalse,
        numShortAnswer,
        numFreeResponse,
        scoreConfig
      );
      const autoGradedMaxScore = calculateMaxScore(
        numMultipleChoice,
        numTrueFalse,
        numShortAnswer,
        numFreeResponse,
        scoreConfig
      );

      const sanitizedName = result.name
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      const filename = testName ? `bai_lam_${testName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${sanitizedName}_${result.testVersionId}.pdf` : `bai_lam_${sanitizedName}_${result.testVersionId}.pdf`;

      const submissionTimeFormatted = result.submissionTime
        ? new Date(result.submissionTime).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : "N/A";

      const escapeHtml = (unsafe: string | undefined | null) => {
        if (!unsafe) return "";
        return String(unsafe)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };

      let tableRowsHtml = "";

      const processQuestionsForPdf = (
        prefix: string,
        count: number,
        parts: string[] = [""],
      ) => {
        for (let i = 1; i <= count; i++) {
          for (const part of parts) {
            const key = `${prefix}-${i}${part && `-${part}`}`;
            const studentAnswer = result.answers[key] || "";
            const normalizedKey = normalizeQuestionKey(key);
            const correctAnswer = correctAnswers[normalizedKey];
            let resultText = "";
            let resultClass = "unanswered";

            if (prefix === "fr") {
              resultText = "(GV chấm)";
              resultClass = "manual-grade";
            } else if (correctAnswer !== undefined) {
              if (studentAnswer) {
                let isRight = false;
                if (prefix === "sa") {
                  isRight =
                    studentAnswer.trim().toLowerCase() ===
                    String(correctAnswer).trim().toLowerCase();
                } else {
                  isRight =
                    normalizeAnswer(studentAnswer) ===
                    normalizeAnswer(correctAnswer);
                }

                if (isRight) {
                  resultText = "Đúng";
                  resultClass = "correct";
                } else {
                  resultText = "Sai";
                  resultClass = "incorrect";
                }
              } else {
                resultText = "Bỏ qua";
              }
            }

            const questionLabel = `Câu ${i}${part && `.${part}`}`;

            tableRowsHtml += `
                    <tr>
                        <td>${questionLabel}</td>
                        <td>${escapeHtml(studentAnswer)}</td>
                        <td>${escapeHtml(correctAnswer ?? "")}</td>
                        <td class="${resultClass}">${escapeHtml(resultText)}</td>
                    </tr>
                `;
          }
        }
      };

      if (numMultipleChoice > 0) {
        tableRowsHtml +=
          '<tr><td colspan="4" class="section-header">Phần I: Trắc nghiệm</td></tr>';
        processQuestionsForPdf("mc", numMultipleChoice);
      }
      if (numTrueFalse > 0) {
        tableRowsHtml +=
          '<tr><td colspan="4" class="section-header">Phần II: Đúng/Sai</td></tr>';
        processQuestionsForPdf("tf", numTrueFalse, ["a", "b", "c", "d"]);
      }
      if (numShortAnswer > 0) {
        tableRowsHtml +=
          '<tr><td colspan="4" class="section-header">Phần III: Trả lời ngắn</td></tr>';
        processQuestionsForPdf("sa", numShortAnswer);
      }
      if (numFreeResponse > 0) {
        const sectionNum = numShortAnswer > 0 ? "IV" : "III";
        tableRowsHtml += `<tr><td colspan="4" class="section-header">Phần ${sectionNum}: Tự luận</td></tr>`;
        processQuestionsForPdf("fr", numFreeResponse);
      }

      const htmlContent = `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 12px; color: #333; }
          .container { padding: 20px; }
          h1 { font-size: 24px; color: #2c3e50; text-align: center; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
          h2 { font-size: 18px; color: #34495e; margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
          .info { margin-bottom: 20px; background-color: #f8f9fa; padding: 15px; border-radius: 5px; border: 1px solid #e9ecef; }
          .info p { margin: 5px 0; }
          .info strong { display: inline-block; width: 120px; color: #495057; }
          .summary { margin-bottom: 20px; background-color: #f8f9fa; padding: 15px; border-radius: 5px; border: 1px solid #e9ecef; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #dee2e6; padding: 10px; text-align: left; }
          th { background-color: #e9ecef; font-weight: bold; }
          tr:nth-child(even) { background-color: #f8f9fa; }
          .section-header { background-color: #d1e7dd !important; font-weight: bold; text-align: center; }
          .correct { color: #198754; font-weight: bold; }
          .incorrect { color: #dc3545; font-weight: bold; }
          .unanswered { color: #6c757d; }
          .manual-grade { color: #6f42c1; }
        </style>
      </head>
      <body>
        <div class="container">
            <h1>${testName ? `${escapeHtml(testName)} - Kết quả bài làm chi tiết` : 'Kết quả bài làm chi tiết'}</h1>
            <div class="info">
                <h2>Thông tin học sinh</h2>
                <p><strong>Số báo danh/Mã học sinh:</strong> ${escapeHtml(result.studentId || "N/A")}</p>
                <p><strong>Họ và tên:</strong> ${escapeHtml(result.name)}</p>
                <p><strong>Lớp:</strong> ${escapeHtml(result.class)}</p>
                ${result.additionalData ? Object.entries(result.additionalData).map(([key, value]) => `<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(value))}</p>`).join("") : ""}
                <p><strong>Mã đề:</strong> ${escapeHtml(result.testVersionId)}</p>
                <p><strong>Thời gian nộp:</strong> ${submissionTimeFormatted}</p>
            </div>
            <div class="summary">
                <h2>Kết quả</h2>
                <p><strong>Điểm chấm tự động:</strong> ${score.toFixed(2)} / ${autoGradedMaxScore.toFixed(1)}</p>
                ${numFreeResponse > 0 ? `<p><strong>Ghi chú:</strong> Điểm trên chưa bao gồm điểm phần tự luận.</p>` : ""}
            </div>
            <h2>Chi tiết câu trả lời</h2>
            <table>
                <thead>
                    <tr>
                        <th style="width: 20%;">Câu hỏi</th>
                        <th style="width: 30%;">Câu trả lời của HS</th>
                        <th style="width: 30%;">Đáp án đúng</th>
                        <th style="width: 20%;">Kết quả</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>
        </div>
      </body>
    </html>
    `;

      const opt = {
        margin: 10,
        filename: filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };

      try {
        window.html2pdf().set(opt).from(htmlContent).save();
      } catch (error) {
        console.error("PDF generation error:", error);
        alert("Đã xảy ra lỗi khi tạo file PDF.");
      }
    },
    [
      testVersions,
      numMultipleChoice,
      numTrueFalse,
      numShortAnswer,
      numFreeResponse,
    ],
  );

  const existingVersionsForPanel = Array.from(testVersions.values()).map(
    (v: TestVersion) => ({
      id: v.id,
      testFile: v.testFile,
      testContent: v.testContent,
      answerKeyFile: v.answerKeyFile,
      correctAnswers: v.correctAnswers,
      isAIGenerated: v.isAIGenerated
    }),
  );

  const renderFocusWarningModal = () => {
    if (!isFocusWarningModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-lg text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            Chú ý Quan trọng!
          </h2>
          <div className="text-left space-y-3 text-gray-700">
            <p>
              Bài kiểm tra sẽ được bắt đầu ở chế độ <strong>Toàn Màn Hình</strong> để
              đảm bảo sự tập trung.
            </p>
            <p>
              <strong>QUY ĐỊNH BẮT BUỘC:</strong>
            </p>
            <ul className="list-disc list-inside bg-yellow-50 border border-yellow-200 p-4 rounded-md">
              <li className="font-semibold">
                <strong>KHÔNG</strong> được thoát khỏi màn hình làm bài (bằng
                phím `Esc` hoặc cách khác).
              </li>
              <li className="font-semibold">
                <strong>KHÔNG</strong> được chuyển sang tab khác hoặc ứng dụng
                khác.
              </li>
              <li className="font-semibold">
                <strong>KHÔNG</strong> được thu nhỏ trình duyệt.
              </li>
            </ul>
            <p className="mt-4 text-red-700 font-bold bg-red-100 p-3 rounded-md">
              NẾU VI PHẠM, BÀI LÀM CỦA BẠN SẼ BỊ{" "}
              <span className="underline">TỰ ĐỘNG NỘP NGAY LẬP TỨC</span>.
            </p>
          </div>
          <div className="flex justify-center gap-4 mt-8">
            <button
              onClick={() => setIsFocusWarningModalOpen(false)}
              className="px-6 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
            >
              Hủy
            </button>
            <button
              onClick={confirmStartTest}
              className="px-6 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md font-semibold"
            >
              Tôi đã hiểu và Đồng ý
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderShareLinkModal = () => {
    if (!isShareLinkModalOpen) return null;
    const handleCopy = () => {
      navigator.clipboard.writeText(shareLink).then(
        () => {
          alert("Đã sao chép link vào clipboard!");
        },
        () => {
          alert("Không thể tự động sao chép. Vui lòng sao chép thủ công.");
        },
      );
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
          <h2 className="text-lg font-bold mb-4">Link chia sẻ cho học sinh</h2>
          <p className="mb-4 text-sm text-gray-600">
            Gửi đường link này cho học sinh để bắt đầu làm bài. Học sinh không
            cần tải file hay đăng nhập.
          </p>
          <textarea
            readOnly
            value={shareLink}
            className="w-full h-24 p-2 border border-gray-300 rounded-md text-sm bg-gray-50 resize-none"
            onFocus={(e) => e.target.select()}
          />
          <p className="text-xs text-yellow-600 mt-1">
            Lưu ý: Đường link có thể rất dài. Hãy gửi qua các ứng dụng nhắn tin
            hỗ trợ link dài.
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setIsShareLinkModalOpen(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Đóng
            </button>
            <button
              onClick={handleCopy}
              className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md"
            >
              Sao chép link
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAlertModal = () => {
    if (!isAlertModalOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
          <h2 className="text-xl font-bold text-red-600 mb-4">Thông báo</h2>
          <p className="text-gray-700 mb-6">{alertMessage}</p>
          <div className="flex justify-end">
            <button
              onClick={() => {
                setIsAlertModalOpen(false);
                // If we are in test taking and not in fullscreen, try to re-enter
                const isFullscreen = !!(
                  document.fullscreenElement ||
                  (document as any).webkitFullscreenElement ||
                  (document as any).mozFullScreenElement ||
                  (document as any).msFullscreenElement
                );
                if (appState === AppState.TEST_TAKING && !isFullscreen) {
                  const docEl = document.documentElement as any;
                  const requestFS =
                    docEl.requestFullscreen ||
                    docEl.webkitRequestFullscreen ||
                    docEl.mozRequestFullScreen ||
                    docEl.msRequestFullscreen;
                  if (requestFS) {
                    requestFS.call(docEl).catch((err: any) => 
                      console.log("Error re-entering fullscreen:", err)
                    );
                  }
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Xác nhận và tiếp tục
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleBackFromControlPanel = useCallback(() => {
    if (appState === AppState.STUDENT_ENTRY && !isStudentSession && auth.currentUser) {
      setAppState(AppState.TEACHER_DASHBOARD);
    } else if (appState === AppState.TEACHER_SETUP && auth.currentUser) {
      setAppState(AppState.TEACHER_DASHBOARD);
    } else {
      handleReturnToRoleSelection();
    }
  }, [appState, isStudentSession, handleReturnToRoleSelection]);

  const renderCurrentState = () => {
    if (appState === AppState.LOADING_SESSION_FROM_URL) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
            <p className="mt-4 text-lg font-semibold text-gray-700">
              Đang tải bài kiểm tra, vui lòng chờ...
            </p>
          </div>
        </div>
      );
    }

    if (appState === AppState.START_SCREEN) {
      return <RoleSelectionScreen onStart={handleStartWithRole} />;
    }

    if (appState === AppState.TEACHER_LOGIN) {
      return (
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
          onBackToRoleSelection={handleReturnToRoleSelection}
          role="teacher"
        />
      );
    }

    if (appState === AppState.TEACHER_DASHBOARD) {
      return (
        <TeacherDashboard
          onCreateNew={handleCreateNewSession}
          onLoadSession={handleLoadSessionFromDashboard}
          onViewResults={handleViewResultsFromDashboard}
          onLogout={handleReturnToRoleSelection}
          isAdmin={currentUser?.role === 'admin'}
          onGoToAdminDashboard={() => setAppState(AppState.ADMIN_DASHBOARD)}
          username={currentUser?.username}
          onSessionRenamed={(oldId, newId) => {
            if (sessionId === oldId) {
              setSessionId(newId);
            }
          }}
        />
      );
    }

    if (appState === AppState.ADMIN_DASHBOARD) {
      return (
        <AdminDashboard
          onBackToTeacherDashboard={() => setAppState(AppState.TEACHER_DASHBOARD)}
        />
      );
    }

    if (appState === AppState.LOCKED) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
          <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-2xl shadow-lg text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Tài khoản đã bị khóa</h1>
            <p className="text-gray-600">
              Tài khoản của bạn đã bị quản trị viên khóa. Vui lòng liên hệ với quản trị viên để biết thêm chi tiết.
            </p>
            <button
              onClick={handleReturnToRoleSelection}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Quay lại trang chủ
            </button>
          </div>
        </div>
      );
    }

    if (appState === AppState.PENDING_APPROVAL) {
      return (
        <PendingApprovalScreen
          onBackToRoleSelection={handleReturnToRoleSelection}
        />
      );
    }

    if (appState === AppState.STUDENT_UPLOAD_SESSION) {
      return (
        <StudentSessionLoader
          username={currentUser?.username || "Học sinh"}
          onSessionFileSelect={handleImportSession}
          onSessionIdSubmit={handleStudentLoadSessionFromId}
          onLogout={handleReturnToRoleSelection}
        />
      );
    }

    if (appState === AppState.STUDENT_AWAIT_FULLSCREEN) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
          <div className="w-full max-w-md p-10 space-y-8 bg-white rounded-2xl shadow-lg text-center">
            <h1 className="text-3xl font-bold text-gray-800">
              Chuẩn bị vào phòng kiểm tra
            </h1>
            <p className="mt-2 text-gray-600">
              Phiên làm bài yêu cầu chế độ toàn màn hình để đảm bảo tập trung.
              Vui lòng bấm "Bắt đầu" để tiếp tục.
            </p>
            <div className="pt-6">
              <button
                onClick={handleStudentProceedToEntry}
                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-lg shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
              >
                Bắt đầu
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (
      appState === AppState.TEACHER_SETUP ||
      appState === AppState.STUDENT_ENTRY
    ) {
      return (
        <>
          {renderFocusWarningModal()}
          {renderShareLinkModal()}
          <ControlPanel
            mode={appState}
            onTeacherSetupComplete={handleTeacherSetupComplete}
            onStudentStart={handleStudentStart}
            onFinishSession={handleFinishSession}
            onExportSession={handleExportSession}
            onExportAllResults={handleExportAllResults}
            onCreateShareableLink={handleCreateShareableLink}
            onReturnToRoleSelection={handleBackFromControlPanel}
            isTeacher={currentRole === "teacher"}
            activeParticipants={activeParticipants}
            completedStudents={allStudentResults.map((s) => ({
              name: s.name,
              class: s.class,
              studentId: s.studentId,
              testVersionId: s.testVersionId,
              id: s.id,
            }))}
            onEditStudentId={handleEditStudentId}
            onDeleteStudentResult={handleDeleteStudentResult}
            existingVersions={existingVersionsForPanel}
            existingConfig={{
              mc: numMultipleChoice,
              tf: numTrueFalse,
              sa: numShortAnswer,
              fr: numFreeResponse,
              duration: testDuration,
              startTime: testStartTime,
              endTime: testEndTime,
              scoreConfig: scoreConfig,
              allowedStudents: allowedStudents,
              additionalStudentFields: additionalStudentFields,
            }}
            existingTestName={testName}
            existingSessionId={sessionId || undefined}
            teacherPassword={teacherPassword}
            testInfo={{
              versions: Array.from(testVersions.values()).map(
                (v: TestVersion) => ({
                  id: v.id,
                  fileName: v.testFile?.name || '(Đề tạo bằng AI)',
                  answerKeyFileName: v.answerKeyFile?.name || '(Tự động)',
                }),
              ),
              mc: numMultipleChoice,
              tf: numTrueFalse,
              sa: numShortAnswer,
              fr: numFreeResponse,
              duration: testDuration,
              startTime: testStartTime,
              endTime: testEndTime,
              allowedStudents: allowedStudents,
              additionalStudentFields: additionalStudentFields,
            }}
            isAdmin={currentUser?.role === 'admin'}
          />
        </>
      );
    }

    if (appState === AppState.SUBMISSION_SUCCESS) {
      const version = lastStudentResult
        ? testVersions.get(lastStudentResult.testVersionId)
        : undefined;

      if (!lastStudentResult || !version || !version.correctAnswers) {
        return null;
      }

      return (
        <SubmissionSuccessView
          onRetakeTest={handleBackToStudentEntry}
          onReviewTest={() => setAppState(AppState.STUDENT_REVIEW)}
          onEndSession={() => setAppState(AppState.TEST_COMPLETED)}
          result={lastStudentResult}
          correctAnswers={version.correctAnswers}
          numMultipleChoice={numMultipleChoice}
          numTrueFalse={numTrueFalse}
          numShortAnswer={numShortAnswer}
          numFreeResponse={numFreeResponse}
          scoreConfig={scoreConfig}
          teacherPassword={teacherPassword}
          testName={testName}
        />
      );
    }

    if (appState === AppState.TEST_COMPLETED) {
      return <TestCompletedScreen onReturnHome={() => window.location.reload()} />;
    }

    if (appState === AppState.STUDENT_REVIEW) {
      const version = lastStudentResult
        ? testVersions.get(lastStudentResult.testVersionId)
        : undefined;

      if (!lastStudentResult || !version || !version.correctAnswers) {
        return null;
      }

      return (
        <StudentResultView
          result={lastStudentResult}
          testFile={version.testFile}
          testContent={version.testContent}
          correctAnswers={version.correctAnswers}
          numMultipleChoice={numMultipleChoice}
          numTrueFalse={numTrueFalse}
          numShortAnswer={numShortAnswer}
          numFreeResponse={numFreeResponse}
          scoreConfig={scoreConfig}
          onBack={() => setAppState(isStudentSession ? AppState.SUBMISSION_SUCCESS : AppState.ALL_RESULTS)}
          testName={testName}
        />
      );
    }

    if (appState === AppState.ALL_RESULTS) {
      return (
        <AllResultsView
          results={allStudentResults}
          testVersions={testVersions}
          numMultipleChoice={numMultipleChoice}
          numTrueFalse={numTrueFalse}
          numShortAnswer={numShortAnswer}
          numFreeResponse={numFreeResponse}
          scoreConfig={scoreConfig}
          onExport={handleExportAllResults}
          onContinueSession={() => setAppState(AppState.TEACHER_DASHBOARD)}
          onExportStudent={handleExportStudentResult}
          onReturnToRoleSelection={handleReturnToRoleSelection}
          onReconfigure={handleResetToSetupKeepFiles}
          onDeleteStudentResult={handleDeleteStudentResult}
          onDeleteMultipleStudentResults={handleDeleteMultipleStudentResults}
          onDeleteActiveParticipant={handleDeleteActiveParticipant}
          onEditStudentId={handleEditStudentId}
          onReviewStudent={handleReviewStudent}
          activeParticipants={activeParticipants}
          teacherPassword={teacherPassword}
          testName={testName}
          isAdmin={currentUser?.role === 'admin'}
        />
      );
    }

    const pdfFile = currentStudent
      ? testVersions.get(currentStudent.testVersionId)?.testFile
      : null;
    const testContent = currentStudent
      ? testVersions.get(currentStudent.testVersionId)?.testContent
      : null;

    const formatTime = (seconds: number | null) => {
      if (seconds === null) return "00:00";
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    const getTimeColor = (seconds: number | null) => {
      if (seconds === null) return "text-gray-800";
      if (seconds <= 60) return "text-red-600 font-bold animate-pulse";
      if (seconds <= 300) return "text-yellow-600 font-bold";
      return "text-gray-800";
    };

    const isFirstSection =
      viewingSection === "mc" ||
      (viewingSection === "tf" && numMultipleChoice === 0) ||
      (viewingSection === "sa" &&
        numMultipleChoice === 0 &&
        numTrueFalse === 0) ||
      (viewingSection === "fr" &&
        numMultipleChoice === 0 &&
        numTrueFalse === 0 &&
        numShortAnswer === 0);

    const isLastSection =
      (viewingSection === "mc" &&
        numTrueFalse === 0 &&
        numShortAnswer === 0 &&
        numFreeResponse === 0) ||
      (viewingSection === "tf" &&
        numShortAnswer === 0 &&
        numFreeResponse === 0) ||
      (viewingSection === "sa" && numFreeResponse === 0) ||
      viewingSection === "fr";

    return (
      <div className="fixed inset-0 flex flex-col p-2 md:p-4 bg-gray-100 gap-2 md:gap-4 font-sans print:static print:min-h-0 print:h-auto print:overflow-visible print:bg-white print:p-0">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-2 border-b-2 border-gray-300 gap-2 print:hidden">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-blue-600">
              {testName ? testName : "Phiên làm bài"}
            </h1>
            {currentStudent && (
              <div className="text-xs md:text-sm text-gray-600">
                <p>
                  SBD:{" "}
                  <span className="font-semibold">
                    {currentStudent.studentId || "N/A"}
                  </span>{" "}
                  - Họ và tên:{" "}
                  <span className="font-semibold">{currentStudent.name}</span>{" "}
                  - Lớp:{" "}
                  <span className="font-semibold">{currentStudent.class}</span>{" "}
                  - Mã đề:{" "}
                  <span className="font-semibold">
                    {currentStudent.testVersionId}
                  </span>
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 self-end md:self-auto">
            <div
              className={`text-xl md:text-2xl font-mono ${getTimeColor(timeLeft)}`}
            >
              {formatTime(timeLeft)}
            </div>
            <button
              onClick={() => handleSubmit("manual")}
              className="px-4 py-2 md:px-6 md:py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 text-sm md:text-base"
            >
              Nộp bài
            </button>
          </div>
        </header>
        <main
          className="flex-grow flex flex-col lg:flex-row gap-4 overflow-hidden print:overflow-visible print:block print:h-auto"
          style={{ minHeight: 0 }}
        >
          {/* Mobile Tabs */}
          <div className="lg:hidden flex border-b border-gray-300 shrink-0 print:hidden">
            {(pdfFile || testContent) && (
              <button
                className={`flex-1 py-2 font-semibold text-sm ${activeMobileTab === "pdf" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}
                onClick={() => setActiveMobileTab("pdf")}
              >
                Đề kiểm tra
              </button>
            )}
            <button
              className={`flex-1 py-2 font-semibold text-sm ${activeMobileTab === "answers" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}
              onClick={() => setActiveMobileTab("answers")}
            >
              Phiếu trả lời
            </button>
          </div>

          {(testContent || pdfFile) && (
            <div
              className={`h-full lg:flex-[2] ${activeMobileTab === "pdf" ? "block" : "hidden"} lg:block overflow-hidden print:overflow-visible print:block print:h-auto print:w-full`}
              style={{ minHeight: 0 }}
            >
              {testContent ? (
                <div className="flex-1 min-h-0 border border-gray-300 rounded-lg overflow-hidden bg-gray-100 relative w-full h-full print:border-none print:overflow-visible print:h-auto print:block print:bg-white">
                  <MarkdownViewer content={testContent} />
                </div>
              ) : pdfFile ? (
                 <div className="relative w-full h-full print:hidden">
                    <PdfViewer file={pdfFile} />
                 </div>
              ) : null}
            </div>
          )}
          <div
            className={`h-full lg:flex-[1] ${activeMobileTab === "answers" ? "block" : "hidden"} lg:block print:hidden`}
            style={{ minHeight: 0 }}
          >
            {currentStudent && (
              <AnswerSheet
                title="Phiếu trả lời"
                numMultipleChoice={numMultipleChoice}
                numTrueFalse={numTrueFalse}
                numShortAnswer={numShortAnswer}
                numFreeResponse={numFreeResponse}
                answers={currentStudent.answers}
                onAnswerChange={handleStudentAnswerChange}
                displaySection={viewingSection}
                onNext={handleGoToNextSection}
                onPrevious={handleGoToPreviousSection}
                isFirstSection={isFirstSection}
                isLastSection={isLastSection}
              />
            )}
          </div>
        </main>
      </div>
    );
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
          <p className="mt-4 text-lg font-semibold text-gray-700">
            Đang tải dữ liệu, vui lòng chờ...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {renderAlertModal()}
      {renderCurrentState()}
    </>
  );
};

export default App;
