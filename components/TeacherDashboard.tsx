import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, getDoc, orderBy, doc, updateDoc, deleteDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { ChevronLeftIcon } from './icons';
import { sanitizeSessionCode, isValidSessionCode, suggestSessionCode } from '../utils';

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

interface Session {
  id: string;
  createdAt: string;
  config: {
    mc: number;
    tf: number;
    sa: number;
    fr: number;
    duration: number;
    testName?: string;
    startTime?: string;
    endTime?: string;
  };
  status: string;
  versionIds?: string[];
  teacherId?: string;
  teacherEmail?: string;
}

interface TeacherDashboardProps {
  onCreateNew: () => void;
  onLoadSession: (sessionId: string) => void;
  onViewResults: (sessionId: string) => void;
  onLogout: () => void;
  isAdmin?: boolean;
  onGoToAdminDashboard?: () => void;
  username?: string;
  onSessionRenamed?: (oldId: string, newId: string) => void;
}

interface SessionStatsProps {
  sessionId: string;
}

const SessionStats: React.FC<SessionStatsProps> = ({ sessionId }) => {
  const [activeCount, setActiveCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    // Listen for results (completed)
    const resultsQuery = collection(db, 'sessions', sessionId, 'results');
    const unsubscribeResults = onSnapshot(resultsQuery, (snapshot) => {
      setCompletedCount(snapshot.size);
    }, (error) => {
      console.error("Error listening to results:", error);
    });

    // Listen for participants (active)
    const participantsQuery = collection(db, 'sessions', sessionId, 'participants');
    const unsubscribeParticipants = onSnapshot(participantsQuery, (snapshot) => {
      // We need to filter out those who have already submitted
      // But for a quick dashboard count, showing total participants who entered is also useful.
      // To be precise, we'd need the results list too, but snapshot.size is a good start.
      setActiveCount(snapshot.size);
    }, (error) => {
      console.error("Error listening to participants:", error);
    });

    return () => {
      unsubscribeResults();
      unsubscribeParticipants();
    };
  }, [sessionId]);

  const currentlyActive = Math.max(0, activeCount - completedCount);

  return (
    <div className="flex flex-col text-xs space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        <span className="text-gray-600 font-medium">Đang làm bài: <span className="text-green-700">{currentlyActive}</span></span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
        <span className="text-gray-600 font-medium">Đã nộp: <span className="text-blue-700">{completedCount}</span></span>
      </div>
    </div>
  );
};

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onCreateNew, onLoadSession, onViewResults, onLogout, isAdmin, onGoToAdminDashboard, username, onSessionRenamed }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [sessionToRename, setSessionToRename] = useState<Session | null>(null);
  const [newSessionCode, setNewSessionCode] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState('');

  useEffect(() => {
    const fetchSessions = async () => {
      if (!auth.currentUser) return;
      try {
        const q = isAdmin 
          ? query(collection(db, 'sessions'), orderBy('createdAt', 'desc'))
          : query(
              collection(db, 'sessions'),
              where('teacherId', '==', auth.currentUser.uid)
            );
        const querySnapshot = await getDocs(q);
        const fetchedSessions: Session[] = [];
        for (const document of querySnapshot.docs) {
          const data = document.data();
          let versionIds = data.versionIds;
          
          if (!versionIds) {
            try {
              const versionsSnap = await getDocs(collection(db, 'sessions', document.id, 'versions'));
              versionIds = versionsSnap.docs.map(vDoc => vDoc.id);
              // Optionally update the document to cache it
              if (versionIds.length > 0) {
                await updateDoc(doc(db, 'sessions', document.id), { versionIds });
              }
            } catch (e) {
              console.error("Error fetching versions for session", document.id, e);
              handleFirestoreError(e, OperationType.GET, `sessions/${document.id}/versions`);
            }
          }
          
          let teacherEmail = '';
          if (isAdmin && data.teacherId) {
            try {
              const userDoc = await getDoc(doc(db, 'users', data.teacherId));
              if (userDoc.exists()) {
                teacherEmail = userDoc.data().email || userDoc.data().username || data.teacherId;
              } else {
                teacherEmail = data.teacherId;
              }
            } catch (e) {
              console.error("Error fetching teacher info", e);
              teacherEmail = data.teacherId;
            }
          }
          
          fetchedSessions.push({ id: document.id, ...data, versionIds, teacherEmail } as Session);
        }
        
        if (!isAdmin) {
          fetchedSessions.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          });
        }
        
        setSessions(fetchedSessions);
      } catch (error) {
        console.error("Error fetching sessions:", error);
        handleFirestoreError(error, OperationType.GET, `sessions`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessions();
  }, []);

  const handleToggleStatus = async (sessionId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'closed' : 'active';
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, { status: newStatus });
      setSessions(sessions.map(s => s.id === sessionId ? { ...s, status: newStatus } : s));
    } catch (error) {
      console.error("Error updating session status:", error);
      alert("Không thể cập nhật trạng thái. Vui lòng thử lại.");
      handleFirestoreError(error, OperationType.UPDATE, `sessions/${sessionId}`);
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;

    try {
      // Delete versions subcollection
      const versionsSnap = await getDocs(collection(db, 'sessions', sessionToDelete, 'versions'));
      const deleteVersionPromises = versionsSnap.docs.map(vDoc => deleteDoc(doc(db, 'sessions', sessionToDelete, 'versions', vDoc.id)));
      await Promise.all(deleteVersionPromises);

      // Delete results subcollection
      const resultsSnap = await getDocs(collection(db, 'sessions', sessionToDelete, 'results'));
      const deleteResultPromises = resultsSnap.docs.map(rDoc => deleteDoc(doc(db, 'sessions', sessionToDelete, 'results', rDoc.id)));
      await Promise.all(deleteResultPromises);

      // Delete the session document
      await deleteDoc(doc(db, 'sessions', sessionToDelete));

      // Update state
      setSessions(sessions.filter(s => s.id !== sessionToDelete));
      setSessionToDelete(null);
    } catch (error) {
      console.error("Error deleting session:", error);
      setSessionToDelete(null);
      handleFirestoreError(error, OperationType.DELETE, `sessions/${sessionToDelete}`);
    }
  };

  const handleRenameSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToRename) return;

    const cleanId = sanitizeSessionCode(newSessionCode).toUpperCase();
    if (!cleanId) {
      setRenameError('Vui lòng nhập mã phiên kiểm tra.');
      return;
    }
    if (!isValidSessionCode(cleanId)) {
      setRenameError('Mã phiên phải từ 3 đến 50 ký tự gồm chữ cái, chữ số, dấu gạch nối (-) hoặc gạch dưới (_).');
      return;
    }
    if (cleanId === sessionToRename.id) {
      setRenameError('Mã phiên mới trùng với mã phiên hiện tại.');
      return;
    }

    setIsRenaming(true);
    setRenameError('');

    const oldSessionId = sessionToRename.id;

    try {
      // Check if new cleanId already exists in Firestore
      const newDocRef = doc(db, 'sessions', cleanId);
      const newDocSnap = await getDoc(newDocRef);
      if (newDocSnap.exists()) {
        setRenameError(`Mã phiên "${cleanId}" đã tồn tại. Vui lòng chọn mã khác.`);
        setIsRenaming(false);
        return;
      }

      // Fetch old session doc
      const oldDocRef = doc(db, 'sessions', oldSessionId);
      const oldDocSnap = await getDoc(oldDocRef);
      if (!oldDocSnap.exists()) {
        setRenameError('Không tìm thấy phiên kiểm tra cũ.');
        setIsRenaming(false);
        return;
      }

      const oldData = oldDocSnap.data();

      // Fetch all subcollections in parallel
      const [versionsSnap, resultsSnap, participantsSnap] = await Promise.all([
        getDocs(collection(db, 'sessions', oldSessionId, 'versions')),
        getDocs(collection(db, 'sessions', oldSessionId, 'results')),
        getDocs(collection(db, 'sessions', oldSessionId, 'participants')),
      ]);

      // 1. Create new session document
      await setDoc(newDocRef, oldData);

      // 2. Copy versions
      const copyVersionPromises = versionsSnap.docs.map(vDoc =>
        setDoc(doc(db, 'sessions', cleanId, 'versions', vDoc.id), vDoc.data())
      );
      await Promise.all(copyVersionPromises);

      // 3. Copy results (and update sessionId field if stored)
      const copyResultPromises = resultsSnap.docs.map(rDoc => {
        const rData = rDoc.data();
        if (rData.sessionId) {
          rData.sessionId = cleanId;
        }
        return setDoc(doc(db, 'sessions', cleanId, 'results', rDoc.id), rData);
      });
      await Promise.all(copyResultPromises);

      // 4. Copy participants
      const copyParticipantPromises = participantsSnap.docs.map(pDoc =>
        setDoc(doc(db, 'sessions', cleanId, 'participants', pDoc.id), pDoc.data())
      );
      await Promise.all(copyParticipantPromises);

      // 5. Delete old documents
      const deleteVersionPromises = versionsSnap.docs.map(vDoc =>
        deleteDoc(doc(db, 'sessions', oldSessionId, 'versions', vDoc.id))
      );
      await Promise.all(deleteVersionPromises);

      const deleteResultPromises = resultsSnap.docs.map(rDoc =>
        deleteDoc(doc(db, 'sessions', oldSessionId, 'results', rDoc.id))
      );
      await Promise.all(deleteResultPromises);

      const deleteParticipantPromises = participantsSnap.docs.map(pDoc =>
        deleteDoc(doc(db, 'sessions', oldSessionId, 'participants', pDoc.id))
      );
      await Promise.all(deleteParticipantPromises);

      await deleteDoc(oldDocRef);

      // 6. Update local state
      setSessions(prev => prev.map(s => s.id === oldSessionId ? { ...s, id: cleanId } : s));

      if (onSessionRenamed) {
        onSessionRenamed(oldSessionId, cleanId);
      }

      setSessionToRename(null);
      setNewSessionCode('');
      alert(`Đã đổi mã phiên kiểm tra thành công sang: ${cleanId}`);
    } catch (err) {
      console.error('Error renaming session:', err);
      setRenameError('Đã có lỗi xảy ra khi đổi mã phiên. Vui lòng thử lại.');
      handleFirestoreError(err, OperationType.WRITE, `sessions/${cleanId}`);
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-6xl p-8 space-y-6 bg-white rounded-2xl shadow-lg">
        <div className="flex justify-between items-center border-b pb-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-600">Quản lý Đề</h1>
            {username && <p className="text-sm text-gray-500 mt-1">Xin chào, <span className="font-semibold">{username}</span></p>}
          </div>
          <div className="flex items-center gap-4">
            {isAdmin && onGoToAdminDashboard && (
              <button
                onClick={onGoToAdminDashboard}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 shadow-sm transition-colors font-medium"
              >
                Quản trị viên
              </button>
            )}
            <button
              onClick={onLogout}
              className="flex items-center text-gray-600 hover:text-red-600 transition-colors"
            >
              <ChevronLeftIcon /> <span className="ml-1">Đăng xuất</span>
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4">
          <h2 className="text-xl font-semibold text-gray-800">Danh sách đề kiểm tra đã lưu</h2>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm transition-colors font-medium"
          >
            + Tạo đề mới
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-gray-500">Bạn chưa có đề kiểm tra nào được lưu.</p>
            <button
              onClick={onCreateNew}
              className="mt-4 px-4 py-2 text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors"
            >
              Tạo đề kiểm tra đầu tiên
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tên đề kiểm tra
                  </th>
                  {isAdmin && (
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Giáo viên
                    </th>
                  )}
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mã phiên kiểm tra
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mã đề kiểm tra
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ngày tạo
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cấu trúc đề
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thời gian làm bài
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lịch mở/đóng
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Theo dõi
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {session.config.testName || 'Không có tên'}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {session.teacherEmail || session.teacherId || 'N/A'}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono bg-blue-50 text-blue-900 border border-blue-200 px-2.5 py-1 rounded font-semibold text-xs">
                          {session.id}
                        </span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(session.id);
                            alert('Đã copy mã phiên kiểm tra: ' + session.id);
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Sao chép mã phiên kiểm tra"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setSessionToRename(session);
                            setNewSessionCode(session.id.length >= 20 ? suggestSessionCode(session.config.testName) : session.id);
                            setRenameError('');
                          }}
                          className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                          title="Tự tạo / Đổi mã phiên dễ nhớ (ví dụ: TOAN10, KT15P,...)"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={session.versionIds?.join(', ')}>
                      {session.versionIds && session.versionIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {session.versionIds.slice(0, 3).map((vid: string) => (
                            <span key={vid} className="font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100">
                              {vid}
                            </span>
                          ))}
                          {session.versionIds.length > 3 && (
                            <span className="font-mono bg-gray-50 text-gray-600 px-2 py-0.5 rounded text-xs border border-gray-200">
                              +{session.versionIds.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Chưa có mã đề</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(session.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {session.config.mc} TN, {session.config.tf} Đ/S, {session.config.sa || 0} TLN, {session.config.fr} TL
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {session.config.duration} phút
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {session.config.startTime ? `Mở: ${new Date(session.config.startTime).toLocaleString('vi-VN')}` : 'Mở: Không giới hạn'}<br/>
                      {session.config.endTime ? `Đóng: ${new Date(session.config.endTime).toLocaleString('vi-VN')}` : 'Đóng: Không giới hạn'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleStatus(session.id, session.status)}
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full transition-colors cursor-pointer ${
                          session.status === 'active' 
                            ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                        title="Nhấn để thay đổi trạng thái"
                      >
                        {session.status === 'active' ? 'Đang mở' : 'Đã đóng'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <SessionStats sessionId={session.id} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                      <button
                        onClick={() => onLoadSession(session.id)}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                      >
                        Mở phiên
                      </button>
                      <button
                        onClick={() => onViewResults(session.id)}
                        className="text-green-600 hover:text-green-900 font-medium"
                      >
                        Xem kết quả
                      </button>
                      <button
                        onClick={() => setSessionToDelete(session.id)}
                        className="text-red-600 hover:text-red-900 font-medium"
                      >
                        Xoá
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sessionToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Xác nhận Xóa Phiên kiểm tra</h2>
            <p className="mb-4 text-sm text-gray-600">
              Bạn có chắc chắn muốn xóa phiên kiểm tra này không? Hành động này không thể hoàn tác và sẽ xóa tất cả kết quả của học sinh.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setSessionToDelete(null)} 
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={handleDeleteSession} 
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionToRename && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Tự tạo Mã phiên kiểm tra
              </h2>
              <button 
                onClick={() => !isRenaming && setSessionToRename(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                disabled={isRenaming}
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs text-gray-500 font-medium">Tên đề kiểm tra:</span>
                <p className="text-sm font-semibold text-gray-800">{sessionToRename.config.testName || 'Không có tên'}</p>
              </div>

              <div>
                <span className="text-xs text-gray-500 font-medium">Mã phiên hiện tại:</span>
                <p className="font-mono text-xs bg-gray-100 p-2 rounded text-gray-700 break-all">{sessionToRename.id}</p>
                {sessionToRename.id.length >= 20 && (
                  <p className="text-xs text-amber-600 mt-1 italic">
                    (Mã gồm 20 ký tự ngẫu nhiên do hệ thống tự sinh ban đầu)
                  </p>
                )}
              </div>

              <form onSubmit={handleRenameSession} className="space-y-4">
                <div>
                  <label htmlFor="new-session-id-input" className="block text-sm font-medium text-gray-700 mb-1">
                    Nhập mã phiên mới (Dễ nhớ):
                  </label>
                  <input
                    id="new-session-id-input"
                    type="text"
                    value={newSessionCode}
                    onChange={(e) => {
                      setNewSessionCode(sanitizeSessionCode(e.target.value).toUpperCase());
                      setRenameError('');
                    }}
                    placeholder="Ví dụ: TOAN10-HK1, KT15P, 12A1..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-base uppercase focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    maxLength={50}
                    disabled={isRenaming}
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Quy chuẩn: 3 - 50 ký tự gồm chữ cái, số, dấu '-' hoặc '_'.
                  </p>
                </div>

                {sessionToRename.config.testName && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">Gợi ý nhanh:</span>
                    <button
                      type="button"
                      onClick={() => setNewSessionCode(suggestSessionCode(sessionToRename.config.testName))}
                      className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded border border-indigo-200 hover:bg-indigo-100 transition-colors font-medium font-mono"
                    >
                      {suggestSessionCode(sessionToRename.config.testName)}
                    </button>
                  </div>
                )}

                {renameError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
                    {renameError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSessionToRename(null)}
                    disabled={isRenaming}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isRenaming || !newSessionCode.trim()}
                    className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:bg-indigo-300 shadow-sm"
                  >
                    {isRenaming ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Đang cập nhật...</span>
                      </>
                    ) : (
                      <span>Lưu mã mới</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
