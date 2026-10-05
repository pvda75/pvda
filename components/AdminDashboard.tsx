import React, { useState, useEffect } from 'react';
import { ChevronLeftIcon } from './icons';
import { db, auth } from '../firebase';
import { collection, query, getDocs, doc, updateDoc, onSnapshot, setDoc, where, deleteDoc } from 'firebase/firestore';

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

interface AdminDashboardProps {
  onBackToTeacherDashboard: () => void;
}

interface UserData {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'teacher' | 'pending' | 'locked';
  createdAt: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBackToTeacherDashboard }) => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList: UserData[] = [];
      snapshot.forEach((doc) => {
        usersList.push({ id: doc.id, ...doc.data() } as UserData);
      });
      // Sort: pending first, then locked, then teacher, then admin
      usersList.sort((a, b) => {
        const roleOrder = { 'pending': 0, 'locked': 1, 'teacher': 2, 'admin': 3 };
        const roleA = a.role || 'pending';
        const roleB = b.role || 'pending';
        if (roleOrder[roleA] !== roleOrder[roleB]) {
          return (roleOrder[roleA] ?? 99) - (roleOrder[roleB] ?? 99);
        }
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setUsers(usersList);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching users:", err);
      setError("Không thể tải danh sách người dùng.");
      setLoading(false);
      handleFirestoreError(err, OperationType.GET, 'users');
    });

    return () => unsubscribe();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'users', id), { role: 'teacher' });
      setSuccess('Đã duyệt tài khoản thành công.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error("Error approving user:", err);
      setError("Lỗi khi duyệt tài khoản.");
      handleFirestoreError(err, OperationType.UPDATE, `users/${id}`);
    }
  };

  const handleLock = async (id: string) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'users', id), { role: 'locked' });
      setSuccess('Đã khóa tài khoản thành công.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error("Error locking user:", err);
      setError("Lỗi khi khóa tài khoản.");
      handleFirestoreError(err, OperationType.UPDATE, `users/${id}`);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'users', id), { role: 'pending' });
      setSuccess('Đã thu hồi quyền thành công.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error("Error revoking user:", err);
      setError("Lỗi khi thu hồi quyền.");
      handleFirestoreError(err, OperationType.UPDATE, `users/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    try {
      await deleteDoc(doc(db, 'users', id));
      setSuccess('Đã xóa tài khoản thành công.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error("Error deleting user:", err);
      setError("Lỗi khi xóa tài khoản.");
      handleFirestoreError(err, OperationType.DELETE, `users/${id}`);
    } finally {
      setUserToDelete(null);
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherEmail.trim()) return;
    
    setIsAddingTeacher(true);
    setError('');
    try {
      // Check if user already exists
      const q = query(collection(db, 'users'), where('email', '==', newTeacherEmail.trim().toLowerCase()));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const existingUser = querySnapshot.docs[0];
        await updateDoc(doc(db, 'users', existingUser.id), { role: 'teacher' });
      } else {
        // Create a pre-approved record
        // We use a random ID since we don't have a UID yet
        const tempId = `pre_${Date.now()}`;
        await setDoc(doc(db, 'users', tempId), {
          uid: '', // Empty UID means pre-approved
          email: newTeacherEmail.trim().toLowerCase(),
          displayName: 'Giáo viên (Chờ đăng nhập)',
          role: 'teacher',
          createdAt: new Date().toISOString()
        });
      }
      setNewTeacherEmail('');
      setSuccess("Đã thêm giáo viên vào danh sách phê duyệt.");
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error("Error adding teacher:", err);
      setError("Lỗi khi thêm giáo viên.");
      handleFirestoreError(err, OperationType.WRITE, 'users');
    } finally {
      setIsAddingTeacher(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
          <h1 className="text-2xl font-bold">Quản trị viên - Duyệt tài khoản</h1>
          <button
            onClick={onBackToTeacherDashboard}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg transition-colors"
          >
            <ChevronLeftIcon /> Quay lại Dashboard
          </button>
        </div>

        <div className="p-6">
          {error && <p className="text-red-500 mb-4">{error}</p>}
          {success && <p className="text-green-600 mb-4 bg-green-50 p-3 rounded-lg border border-green-200">{success}</p>}

          <div className="mb-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <h2 className="text-lg font-semibold text-blue-800 mb-2 text-left">Thêm giáo viên mới (Phê duyệt trước)</h2>
            <form onSubmit={handleAddTeacher} className="flex gap-2">
              <input
                type="email"
                placeholder="Nhập email giáo viên..."
                value={newTeacherEmail}
                onChange={(e) => setNewTeacherEmail(e.target.value)}
                className="flex-1 px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="submit"
                disabled={isAddingTeacher}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:bg-blue-400"
              >
                {isAddingTeacher ? 'Đang thêm...' : 'Thêm'}
              </button>
            </form>
            <p className="text-xs text-blue-600 mt-2 text-left">
              * Giáo viên sử dụng email này khi đăng nhập sẽ được cấp quyền ngay lập tức.
            </p>
          </div>
          
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên / Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vai trò</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày tạo</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{user.displayName}</div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                          user.role === 'teacher' ? 'bg-green-100 text-green-800' :
                          user.role === 'locked' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {user.role === 'admin' ? 'Quản trị viên' : 
                           user.role === 'teacher' ? 'Giáo viên' : 
                           user.role === 'locked' ? 'Đã khóa' : 
                           'Chờ duyệt'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        {(user.role === 'pending' || user.role === 'locked') && user.id && (
                          <button onClick={() => handleApprove(user.id)} className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 px-3 py-1 rounded-md">
                            {user.role === 'locked' ? 'Mở khóa' : 'Duyệt'}
                          </button>
                        )}
                        {(user.role === 'teacher' || user.role === 'pending') && user.id && user.uid !== '' && (
                          <button onClick={() => handleLock(user.id)} className="text-orange-600 hover:text-orange-900 bg-orange-50 px-3 py-1 rounded-md">
                            Khóa
                          </button>
                        )}
                        {user.role === 'teacher' && user.id && user.uid !== '' && (
                          <button onClick={() => handleRevoke(user.id)} className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded-md">
                            Thu hồi
                          </button>
                        )}
                        {user.uid === '' && user.id && (
                          <button onClick={() => setUserToDelete(user.id)} className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded-md">
                            Xóa
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                        Không có người dùng nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Xác nhận Xóa</h2>
            <p className="mb-4 text-sm text-gray-600">
              Bạn có chắc chắn muốn xóa tài khoản này khỏi danh sách phê duyệt không?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setUserToDelete(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Hủy</button>
              <button onClick={() => handleDelete(userToDelete)} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
