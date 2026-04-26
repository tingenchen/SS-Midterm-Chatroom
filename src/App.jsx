import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup,
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc
} from 'firebase/firestore';

// 1. Firebase 初始化配置 (已帶入你的專屬 Config)
const firebaseConfig = {
  apiKey: "AIzaSyBp8qvEOmyTM5cIl36JpE9wnbXKD-fOMR0",
  authDomain: "software-studio-7a874.firebaseapp.com",
  databaseURL: "https://software-studio-7a874-default-rtdb.firebaseio.com",
  projectId: "software-studio-7a874",
  storageBucket: "software-studio-7a874.firebasestorage.app",
  messagingSenderId: "1095518903414",
  appId: "1:1095518903414:web:a5f8b3c83bf5d050449357",
  measurementId: "G-61GRW4JF86"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Profile Modal 狀態
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    username: '',
    phone: '',
    address: '',
    photoURL: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  // 2. 監聽用戶登入狀態，並拉取 Firestore 資料
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, "users", currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            setUserData(userDoc.data());
            setProfileForm({
              username: userDoc.data().username || '',
              phone: userDoc.data().phone || '',
              address: userDoc.data().address || '',
              photoURL: userDoc.data().photoURL || ''
            });
          } else {
            // 例外處理：如果在 Auth 有帳號，但 Firestore 沒資料，幫他補建
            const defaultData = {
              email: currentUser.email,
              username: currentUser.displayName || currentUser.email.split('@')[0],
              address: '',
              phone: '',
              photoURL: currentUser.photoURL || '',
              createdAt: new Date().toISOString()
            };
            await setDoc(userDocRef, defaultData);
            setUserData(defaultData);
            setProfileForm(defaultData);
          }
        } catch (err) {
          console.error("讀取資料庫失敗:", err);
          setError("資料庫連線失敗，請確認 Firestore 已啟用測試模式：" + err.message);
        }
      } else {
        setUserData(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // 3. 處理登入/註冊
  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegistering) {
        // 註冊邏輯
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        try {
          await setDoc(doc(db, "users", userCredential.user.uid), {
            email: userCredential.user.email,
            username: email.split('@')[0],
            address: '',
            phone: '',
            photoURL: '',
            createdAt: new Date().toISOString()
          });
        } catch (dbErr) {
          console.error("寫入資料庫失敗", dbErr);
          throw new Error("帳號已建立，但資料庫寫入失敗 (請確認 Firestore 權限)");
        }
      } else {
        // 登入邏輯
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error("認證錯誤:", err);
      if (err.code === 'auth/email-already-in-use') setError('這個 Email 已經被註冊過了！');
      else if (err.code === 'auth/wrong-password') setError('密碼錯誤！');
      else if (err.code === 'auth/user-not-found') setError('找不到此用戶！');
      else if (err.code === 'auth/operation-not-allowed') setError('請至 Firebase Console 開啟 Email 登入功能！');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setError('');
    try {
      const result = await signInWithPopup(auth, provider);
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: result.user.email,
          username: result.user.displayName || result.user.email.split('@')[0],
          photoURL: result.user.photoURL || '',
          address: '',
          phone: '',
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      if (err.code === 'auth/operation-not-allowed') {
        setError('請至 Firebase Console 開啟 Google 登入功能！');
      } else {
        setError('Google 登入失敗：' + err.message);
      }
    }
  };

  // 4. 儲存個人檔案邏輯
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        username: profileForm.username,
        phone: profileForm.phone,
        address: profileForm.address,
        photoURL: profileForm.photoURL
      });
      setUserData(prev => ({...prev, ...profileForm}));
      setIsProfileOpen(false); 
    } catch (err) {
      alert("儲存失敗：" + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 5. 畫面渲染：已登入大廳 (包含 Profile Modal)
  if (user && userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 relative">
        <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md text-center border border-gray-100 z-10">
          <div className="mb-6 relative inline-block">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden border-4 border-white shadow-md">
              {userData.photoURL ? (
                <img src={userData.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-blue-600">
                  {userData.username[0].toUpperCase()}
                </span>
              )}
            </div>
            <button 
              onClick={() => setIsProfileOpen(true)}
              className="absolute bottom-4 right-0 bg-blue-600 text-white p-2 rounded-full shadow-lg hover:bg-blue-700 transition"
              title="編輯個人檔案"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
            </button>
          </div>
          
          <h1 className="text-2xl font-extrabold text-gray-800">{userData.username}</h1>
          <p className="text-gray-500 mt-1 font-medium">{userData.email}</p>
          
          <div className="mt-8 space-y-3">
            <button 
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-all duration-200 shadow-md"
              onClick={() => {/* 未來切換至聊天室 */}}
            >
              進入聊天室
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="w-full bg-white text-red-500 border border-red-100 py-3 rounded-xl font-semibold hover:bg-red-50 transition-all duration-200"
            >
              登出帳號
            </button>
          </div>
        </div>

        {/* Profile Modal */}
        {isProfileOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl transform transition-all">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-800">編輯個人檔案</h2>
                <button onClick={() => setIsProfileOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4 text-left">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">電子郵件 (不可修改)</label>
                  <input type="text" value={userData.email} disabled className="w-full p-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">使用者名稱 (Username)</label>
                  <input type="text" value={profileForm.username} onChange={(e) => setProfileForm({...profileForm, username: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">頭像網址 (Profile Picture URL)</label>
                  <input type="url" value={profileForm.photoURL} onChange={(e) => setProfileForm({...profileForm, photoURL: e.target.value})} placeholder="https://example.com/avatar.jpg" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">電話 (Phone number)</label>
                  <input type="tel" value={profileForm.phone} onChange={(e) => setProfileForm({...profileForm, phone: e.target.value})} placeholder="0912345678" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">地址 (Address)</label>
                  <textarea value={profileForm.address} onChange={(e) => setProfileForm({...profileForm, address: e.target.value})} placeholder="新竹市光復路二段101號" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24" />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsProfileOpen(false)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition">取消</button>
                  <button type="submit" disabled={isSaving} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:bg-blue-300">
                    {isSaving ? '儲存中...' : '儲存變更'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 6. 畫面渲染：未登入表單
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
      <div className="bg-white p-10 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            {isRegistering ? '建立新帳號' : '會員登入'}
          </h1>
          <p className="text-gray-500 mt-2 text-sm">歡迎加入清華軟體設計實驗聊天室</p>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl mb-6 text-sm flex items-start">
            <span className="mr-2">⚠️</span><span>{error}</span>
          </div>
        )}
        
        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">電子郵件</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">密碼</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <button type="submit" disabled={loading} className="w-full py-4 rounded-xl font-bold text-white transition-all bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300">
            {loading ? '處理中...' : (isRegistering ? '立即註冊' : '登入系統')}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center text-sm">
          <button onClick={() => {setIsRegistering(!isRegistering); setError('');}} className="text-blue-600 font-semibold hover:underline">
            {isRegistering ? '已有帳號？返回登入' : '還沒有帳號？現在註冊'}
          </button>
        </div>

        <div className="mt-8">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200"></span></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-gray-400 font-bold tracking-widest">或</span></div>
          </div>
          <button onClick={handleGoogleSignIn} className="mt-6 w-full bg-white border border-gray-200 py-3 rounded-xl flex items-center justify-center space-x-3 hover:bg-gray-50 font-semibold text-gray-700 shadow-sm transition-all">
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            <span>使用 Google 快速登入</span>
          </button>
        </div>
      </div>
    </div>
  );
}