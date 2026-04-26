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
  getDoc 
} from 'firebase/firestore';

// 1. Firebase 初始化配置 (請把你在 Console 拿到的金鑰填入這裡)
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

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 2. 監聽用戶是否已經登入
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 3. 處理 Email 註冊與登入
  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegistering) {
        // 註冊邏輯
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // 註冊成功後，將用戶資料寫入 Firestore (作業要求：Database read/write 5%)
        await setDoc(doc(db, "users", userCredential.user.uid), {
          email: userCredential.user.email,
          username: email.split('@')[0], // 預設拿 Email 前綴當名稱
          address: '',
          phone: '',
          photoURL: '',
          createdAt: new Date().toISOString()
        });
      } else {
        // 登入邏輯
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      // 處理錯誤訊息
      if (err.code === 'auth/email-already-in-use') setError('這個 Email 已經被註冊過了！');
      else if (err.code === 'auth/wrong-password') setError('密碼錯誤！');
      else if (err.code === 'auth/user-not-found') setError('找不到此用戶！');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 4. 處理 Google 登入 (Bonus 1%)
  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setError('');
    try {
      const result = await signInWithPopup(auth, provider);
      // 檢查是不是第一次登入，如果是的話幫他在資料庫建立一筆資料
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
      setError('Google 登入失敗：' + err.message);
    }
  };

  // 5. 畫面渲染：如果已經登入，顯示大廳畫面
  if (user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center">
          <div className="w-24 h-24 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center overflow-hidden">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-blue-500">
                {(user.displayName || user.email)[0].toUpperCase()}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">歡迎來到聊天室！</h1>
          <p className="text-gray-500 mb-6">{user.displayName || user.email}</p>
          
          <button 
            onClick={() => {/* 未來這裡會切換到聊天室畫面 */}}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition mb-3"
          >
            進入大廳
          </button>
          <button 
            onClick={() => signOut(auth)}
            className="w-full bg-gray-100 text-red-500 py-3 rounded-xl font-bold hover:bg-gray-200 transition"
          >
            登出
          </button>
        </div>
      </div>
    );
  }

  // 6. 畫面渲染：還沒登入，顯示登入/註冊表單
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">
          {isRegistering ? '註冊新帳號' : '會員登入'}
        </h1>
        <p className="text-center text-gray-500 mb-6">期中專案 - 聊天室</p>
        
        {/* 錯誤訊息提示框 */}
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm border border-red-200">
            {error}
          </div>
        )}
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">電子郵件</label>
            <input 
              type="email" 
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="請輸入信箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
            <input 
              type="password" 
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="至少 6 個字元"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:bg-blue-300"
          >
            {loading ? '處理中...' : (isRegistering ? '註冊' : '登入')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button 
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            className="text-blue-600 text-sm font-medium hover:underline"
          >
            {isRegistering ? '已經有帳號了？點此登入' : '還沒有帳號？點此註冊'}
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center space-x-2">
          <span className="h-px w-full bg-gray-200"></span>
          <span className="text-gray-400 text-sm font-medium">或</span>
          <span className="h-px w-full bg-gray-200"></span>
        </div>
        
        <button 
          onClick={handleGoogleSignIn}
          className="mt-6 w-full flex items-center justify-center space-x-2 border border-gray-300 py-3 rounded-xl hover:bg-gray-50 transition font-medium text-gray-700"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span>使用 Google 登入</span>
        </button>
      </div>
    </div>
  );
}