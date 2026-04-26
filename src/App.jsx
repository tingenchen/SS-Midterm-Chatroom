import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, onSnapshot, addDoc, arrayUnion 
} from 'firebase/firestore';

// --- 1. Firebase 初始化 ---
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
  
  // Profile
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ username: '', email: '', phone: '', address: '', photoURL: '' });
  
  // 核心資料狀態
  const [allUsers, setAllUsers] = useState([]); 
  const [chatrooms, setChatrooms] = useState([]); 
  const [currentRoom, setCurrentRoom] = useState(null); 
  const [messages, setMessages] = useState([]); 
  
  // 訊息輸入區狀態
  const [newMessage, setNewMessage] = useState(''); 
  const [selectedImage, setSelectedImage] = useState(null); 
  const [isUploading, setIsUploading] = useState(false); 
  
  // 訊息操作狀態 (編輯與回覆)
  const [editingMsgId, setEditingMsgId] = useState(null); 
  const [editMsgText, setEditMsgText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); 
  const [highlightedMsgId, setHighlightedMsgId] = useState(null); 
  
  // 搜尋狀態
  const [searchQuery, setSearchQuery] = useState('');

  const [sidebarTab, setSidebarTab] = useState('chats'); 
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // 【新增】紀錄是否是初次載入房間，或是自己剛發送訊息
  const shouldAutoScroll = useRef(true);

  // --- 群組狀態 ---
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState(false); 
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [editGroupForm, setEditGroupForm] = useState({ name: '', photoURL: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setUserData(null); setAllUsers([]); setChatrooms([]);
        setCurrentRoom(null); setMessages([]); setEmail(''); setPassword('');
        setSearchQuery(''); setSelectedImage(null); setReplyingTo(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return; 
    const fetchUserData = async () => {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          setUserData(userDoc.data());
          setProfileForm({
            username: userDoc.data().username || '', email: userDoc.data().email || user.email, 
            phone: userDoc.data().phone || '', address: userDoc.data().address || '', photoURL: userDoc.data().photoURL || ''
          });
        } else {
          const defaultData = {
            email: user.email, username: user.displayName || user.email?.split('@')[0] || 'Unknown',
            address: '', phone: '', photoURL: user.photoURL || '', createdAt: Date.now()
          };
          await setDoc(userDocRef, defaultData);
          setUserData(defaultData); setProfileForm(defaultData);
        }
      } catch (err) { console.error("抓取個人資料失敗:", err); }
    };
    fetchUserData();

    const usersUnsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersList = [];
      snapshot.forEach(d => { if (d.id !== user.uid) usersList.push({ id: d.id, ...d.data() }); });
      setAllUsers(usersList);
    });

    const roomsUnsub = onSnapshot(collection(db, "chatrooms"), (snapshot) => {
      const roomsList = [];
      snapshot.forEach(d => {
        const data = d.data();
        if (data.members && data.members.includes(user.uid)) roomsList.push({ id: d.id, ...data });
      });
      roomsList.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      setChatrooms(roomsList);
      
      setCurrentRoom(prevRoom => {
        if (!prevRoom) return null;
        const updatedRoom = roomsList.find(r => r.id === prevRoom.id);
        return updatedRoom || prevRoom;
      });
    });

    return () => { usersUnsub(); roomsUnsub(); };
  }, [user]);

  // 切換房間時，允許自動滾動
  useEffect(() => {
    shouldAutoScroll.current = true;
  }, [currentRoom?.id]);

  useEffect(() => {
    if (!currentRoom?.id) { setMessages([]); return; }
    const messagesUnsub = onSnapshot(collection(db, `chatrooms/${currentRoom.id}/messages`), (snapshot) => {
      const msgs = [];
      snapshot.forEach(d => msgs.push({ id: d.id, ...d.data() }));
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMessages(msgs);
      
      // 【修改滾動邏輯】只有在被允許時才滾動
      if (shouldAutoScroll.current && !searchQuery) {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        // 初始滾動完後，關閉自動滾動，直到使用者發出新訊息
        setTimeout(() => { shouldAutoScroll.current = false; }, 300);
      }
    });
    return () => messagesUnsub();
  }, [currentRoom?.id, searchQuery]);

  // --- 發送訊息 ---
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedImage) || !currentRoom || isUploading) return;

    setIsUploading(true);
    // 【新增】自己發送訊息時，強制允許捲動到底部
    shouldAutoScroll.current = true;

    const replyData = replyingTo ? {
      id: replyingTo.id,
      senderName: replyingTo.senderName,
      text: replyingTo.imageUrl ? '傳送了一張圖片' : replyingTo.text
    } : null;

    try {
      if (selectedImage) {
        const base64String = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(selectedImage);
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
        });

        await addDoc(collection(db, `chatrooms/${currentRoom.id}/messages`), {
          text: '', 
          imageUrl: base64String, 
          senderId: user.uid, 
          senderName: userData.username,
          senderPhoto: userData.photoURL || '', 
          createdAt: Date.now(),
          isEdited: false,
          replyTo: replyData 
        });

        await updateDoc(doc(db, "chatrooms", currentRoom.id), { 
          lastMessage: '傳送了一張圖片', 
          lastMessageTime: Date.now() 
        });

        setSelectedImage(null);
        setNewMessage(''); 
      } else {
        await addDoc(collection(db, `chatrooms/${currentRoom.id}/messages`), {
          text: newMessage.trim(), 
          imageUrl: '', 
          senderId: user.uid, 
          senderName: userData.username,
          senderPhoto: userData.photoURL || '', 
          createdAt: Date.now(),
          isEdited: false,
          replyTo: replyData 
        });

        await updateDoc(doc(db, "chatrooms", currentRoom.id), { 
          lastMessage: newMessage.trim(), 
          lastMessageTime: Date.now() 
        });

        setNewMessage('');
      }

      setReplyingTo(null);

    } catch (err) {
      console.error("發送訊息過程中發生錯誤", err);
      alert("發送失敗: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      if (e.target.files[0].size > 1024 * 1024) {
        alert("圖片太大了！請選擇 1MB 以下的圖片，否則資料庫會無法負荷。");
        return;
      }
      setSelectedImage(e.target.files[0]);
    }
  };

  // --- 點擊回覆並捲動至特定訊息並播放動畫 ---
  const scrollToMessage = (msgId) => {
    // 【新增】點擊跳轉時，關閉自動捲動到底部
    shouldAutoScroll.current = false;
    
    const element = document.getElementById(`msg-${msgId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => setHighlightedMsgId(null), 1200); 
    } else {
      alert("無法找到該則訊息，可能已被收回或刪除。");
    }
  };

  const startEditingMessage = (msg) => {
    setEditingMsgId(msg.id);
    setEditMsgText(msg.text);
  };

  const saveEditedMessage = async () => {
    if (!editMsgText.trim()) return;
    try {
      await updateDoc(doc(db, `chatrooms/${currentRoom.id}/messages`, editingMsgId), {
        text: editMsgText.trim(),
        isEdited: true
      });
      setEditingMsgId(null);
    } catch (err) { alert("編輯失敗：" + err.message); }
  };

  const handleUnsendMessage = async (msg) => {
    if (!window.confirm("確定要收回這則訊息嗎？")) return;
    try {
      await deleteDoc(doc(db, `chatrooms/${currentRoom.id}/messages`, msg.id));
    } catch (err) { alert("收回失敗：" + err.message); }
  };

  const startPrivateChat = async (targetUser) => {
    const existingRoom = chatrooms.find(room => room.type === 'private' && room.members.length === 2 && room.members.includes(targetUser.id));
    if (existingRoom) { setCurrentRoom(existingRoom); } 
    else {
      const newRoom = { type: 'private', members: [user.uid, targetUser.id], names: { [user.uid]: userData.username, [targetUser.id]: targetUser.username }, createdAt: Date.now(), lastMessage: '', lastMessageTime: Date.now() };
      const docRef = await addDoc(collection(db, "chatrooms"), newRoom);
      setCurrentRoom({ id: docRef.id, ...newRoom });
    }
    setSidebarTab('chats');
  };

  const openGroupModal = (isInvite = false) => { setInviteMode(isInvite); setGroupName(''); setSelectedUsers([]); setIsGroupModalOpen(true); };
  const toggleUserSelect = (userId) => setSelectedUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  
  const handleGroupSubmit = async () => {
    if (selectedUsers.length === 0) return alert("請至少選擇一位成員！");
    if (inviteMode && currentRoom) {
      const updates = { members: arrayUnion(...selectedUsers) };
      if (currentRoom.type === 'private') { updates.type = 'group'; updates.name = `${userData.username} 發起的群組`; }
      await updateDoc(doc(db, "chatrooms", currentRoom.id), updates);
      await addDoc(collection(db, `chatrooms/${currentRoom.id}/messages`), { text: `${userData.username} 邀請了新成員加入`, senderId: 'system', senderName: '系統', senderPhoto: '', createdAt: Date.now() });
    } else {
      const newRoom = { type: 'group', name: groupName.trim() || `${userData.username} 發起的群組`, photoURL: '', members: [user.uid, ...selectedUsers], createdAt: Date.now(), lastMessage: '群組已建立', lastMessageTime: Date.now() };
      const docRef = await addDoc(collection(db, "chatrooms"), newRoom);
      setCurrentRoom({ id: docRef.id, ...newRoom }); setSidebarTab('chats');
    }
    setIsGroupModalOpen(false);
  };

  const openEditGroupModal = () => { setEditGroupForm({ name: currentRoom.name || '', photoURL: currentRoom.photoURL || '' }); setIsEditGroupModalOpen(true); };
  const handleEditGroupSubmit = async (e) => {
    e.preventDefault();
    try { await updateDoc(doc(db, "chatrooms", currentRoom.id), { name: editGroupForm.name, photoURL: editGroupForm.photoURL }); setIsEditGroupModalOpen(false); } 
    catch (err) { alert("更新群組失敗：" + err.message); }
  };

  const getRoomName = (room) => {
    if (room.type === 'private') {
      const otherId = room.members.find(id => id !== user.uid);
      const otherUser = allUsers.find(u => u.id === otherId);
      return otherUser ? otherUser.username : '未知用戶';
    }
    return room.name || '群組聊天';
  };
  const getRoomPhoto = (room) => {
    if (room.type === 'private') {
      const otherId = room.members.find(id => id !== user.uid);
      const otherUser = allUsers.find(u => u.id === otherId);
      return otherUser ? otherUser.photoURL : null;
    }
    return room.photoURL || null; 
  };

  const handleAuth = async (e) => {
    e.preventDefault(); setError('');
    try {
      if (isRegistering) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", cred.user.uid), { email: cred.user.email, username: email.split('@')[0], address: '', phone: '', photoURL: '', createdAt: Date.now() });
      } else { await signInWithEmailAndPassword(auth, email, password); }
    } catch (err) { if (err.code === 'auth/invalid-credential') setError('帳號或密碼錯誤！'); else setError("認證錯誤：" + err.message); }
  };
  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider(); setError('');
    try {
      const result = await signInWithPopup(auth, provider);
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) await setDoc(userRef, { email: result.user.email, username: result.user.displayName || result.user.email.split('@')[0], photoURL: result.user.photoURL || '', address: '', phone: '', createdAt: Date.now() });
    } catch (err) { setError('Google 登入失敗：' + err.message); }
  };
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, "users", user.uid), { username: profileForm.username, email: profileForm.email, phone: profileForm.phone, address: profileForm.address, photoURL: profileForm.photoURL });
    setUserData(prev => ({...prev, ...profileForm})); setIsProfileOpen(false); 
  };

  const filteredMessages = messages.filter(msg => 
    msg.text?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    msg.senderName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ================= 渲染畫面 =================
  if (!user || !userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md">
          <h1 className="text-3xl font-black text-center mb-6">{isRegistering ? '註冊帳號' : '會員登入'}</h1>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm font-bold">{error}</div>}
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="email" placeholder="電子郵件" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">{isRegistering ? '註冊' : '登入'}</button>
          </form>
          <button onClick={() => { setIsRegistering(!isRegistering); setError(''); }} className="mt-4 text-blue-600 w-full text-center text-sm font-bold hover:underline">
            {isRegistering ? '已有帳號？切換登入' : '沒有帳號？立即註冊'}
          </button>
          <div className="mt-6">
            <button onClick={handleGoogleSignIn} className="w-full bg-white border border-gray-200 py-3 rounded-xl flex items-center justify-center space-x-3 hover:bg-gray-50 font-bold text-gray-700 shadow-sm transition-all">
              <span>使用 Google 快速登入</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
      <style>{`
        @keyframes pop-wobble {
          0% { transform: scale(1) rotate(0deg); }
          15% { transform: scale(1.05) rotate(-3deg); box-shadow: 0 0 15px rgba(59, 130, 246, 0.6); }
          30% { transform: scale(1.05) rotate(3deg); box-shadow: 0 0 15px rgba(59, 130, 246, 0.6); }
          45% { transform: scale(1.05) rotate(-3deg); box-shadow: 0 0 15px rgba(59, 130, 246, 0.6); }
          60% { transform: scale(1.05) rotate(3deg); box-shadow: 0 0 15px rgba(59, 130, 246, 0.6); }
          75% { transform: scale(1.05) rotate(-2deg); box-shadow: 0 0 15px rgba(59, 130, 246, 0.6); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .animate-pop-wobble {
          animation: pop-wobble 1.2s ease-in-out;
          z-index: 20;
          position: relative;
        }
      `}</style>
      
      {/* 左側 Sidebar */}
      <div className={`${currentRoom ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 bg-white border-r relative`}>
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80" onClick={() => setIsProfileOpen(true)}>
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center overflow-hidden">
              {userData.photoURL ? <img src={userData.photoURL} className="w-full h-full object-cover" /> : <span className="font-bold text-blue-600">{userData.username[0].toUpperCase()}</span>}
            </div>
            <div>
              <h2 className="font-bold text-gray-800 leading-tight">{userData.username}</h2>
              <p className="text-xs text-gray-500">點擊編輯個人檔案</p>
            </div>
          </div>
          <button onClick={() => signOut(auth)} className="text-xs text-red-500 font-bold hover:bg-red-50 p-2 rounded-lg transition">登出</button>
        </div>

        <div className="flex border-b">
          <button onClick={() => setSidebarTab('chats')} className={`flex-1 py-3 text-sm font-bold ${sidebarTab === 'chats' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>聊天室</button>
          <button onClick={() => setSidebarTab('users')} className={`flex-1 py-3 text-sm font-bold ${sidebarTab === 'users' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>所有用戶 ({allUsers.length})</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sidebarTab === 'chats' ? (
            chatrooms.length > 0 ? chatrooms.map(room => (
              <div key={room.id} onClick={() => {setCurrentRoom(room); setSearchQuery(''); setReplyingTo(null);}} className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition flex items-center gap-3 ${currentRoom?.id === room.id ? 'bg-blue-50' : ''}`}>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 text-blue-600">
                  {getRoomPhoto(room) ? (
                    <img src={getRoomPhoto(room)} className="w-full h-full object-cover" alt="avatar" />
                  ) : (
                    room.type === 'group' 
                    ? <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    : <span className="font-bold">{getRoomName(room)[0].toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-800 truncate">{getRoomName(room)}</h3>
                  <p className="text-sm text-gray-500 truncate mt-1">{room.lastMessage || '尚無訊息'}</p>
                </div>
              </div>
            )) : <div className="p-6 text-center text-gray-400 mt-10">尚無聊天紀錄<br/><span className="text-sm">請點擊上方「所有用戶」發起私訊</span></div>
          ) : (
            <>
              <div className="p-4 border-b">
                <button onClick={() => openGroupModal(false)} className="w-full bg-blue-50 border border-blue-200 text-blue-600 py-2 rounded-xl font-bold hover:bg-blue-100 transition flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  建立新群組
                </button>
              </div>
              {allUsers.length > 0 ? allUsers.map(u => (
                <div key={u.id} className="p-4 border-b flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                      {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover" /> : <span className="font-bold text-gray-500">{u.username[0].toUpperCase()}</span>}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-800 truncate">{u.username}</h3>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    </div>
                  </div>
                  <button onClick={() => startPrivateChat(u)} className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-sm font-bold hover:bg-blue-100 transition shadow-sm flex-shrink-0">私訊</button>
                </div>
              )) : <div className="p-6 text-center text-gray-400 mt-10">目前沒有其他註冊用戶</div>}
            </>
          )}
        </div>
      </div>

      {/* 右側 聊天室主體 */}
      <div className={`${!currentRoom ? 'hidden md:flex' : 'flex'} flex-col flex-1 bg-white relative`}>
        {currentRoom ? (
          <>
            <div className="bg-white p-4 border-b flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center flex-1 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition" onClick={() => currentRoom.type === 'group' && openEditGroupModal()}>
                <button onClick={(e) => { e.stopPropagation(); setCurrentRoom(null); setReplyingTo(null); }} className="md:hidden mr-3 text-blue-600 font-bold bg-blue-50 px-3 py-1 rounded-lg">←</button>
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center overflow-hidden mr-3 flex-shrink-0">
                  {getRoomPhoto(currentRoom) ? (
                    <img src={getRoomPhoto(currentRoom)} className="w-full h-full object-cover" alt="avatar" />
                  ) : (
                    currentRoom.type === 'group' 
                    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    : <span className="font-bold text-xs">{getRoomName(currentRoom)[0].toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-800 leading-tight truncate">
                    {getRoomName(currentRoom)} {currentRoom.type === 'group' && <span className="text-xs text-blue-500 ml-1">✎ 編輯</span>}
                  </h2>
                  <p className="text-xs text-gray-500">{currentRoom.members?.length || 0} 位成員</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜尋訊息..." className="w-32 md:w-48 pl-8 pr-3 py-1.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <button onClick={() => openGroupModal(true)} className="bg-blue-50 text-blue-600 p-2 rounded-full hover:bg-blue-100 transition flex-shrink-0" title="邀請新成員加入">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 relative">
              {filteredMessages.map(msg => {
                const isMe = msg.senderId === user.uid;
                const isSystem = msg.senderId === 'system';
                const isHighlighted = highlightedMsgId === msg.id;
                
                if (isSystem) {
                  return (
                    <div key={msg.id} id={`msg-${msg.id}`} className={`flex justify-center my-2 ${isHighlighted ? 'animate-pop-wobble' : ''}`}>
                      <span className="bg-gray-200 text-gray-500 text-xs px-3 py-1 rounded-full font-medium">{msg.text}</span>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} id={`msg-${msg.id}`} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative`}>
                    {!isMe && (
                      <div className="w-8 h-8 rounded-full bg-gray-300 mr-2 flex-shrink-0 overflow-hidden flex items-center justify-center mt-1">
                        {msg.senderPhoto ? <img src={msg.senderPhoto} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-white">{msg.senderName[0].toUpperCase()}</span>}
                      </div>
                    )}
                    
                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] md:max-w-[70%] transition-transform duration-300 ${isHighlighted ? 'animate-pop-wobble' : ''}`}>
                      
                      <div className={`flex gap-2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4 ${isMe ? 'right-2' : 'left-10'} bg-white shadow-sm border border-gray-200 rounded-lg px-2 py-1 z-10`}>
                        <button onClick={() => setReplyingTo(msg)} className="text-xs text-gray-500 hover:text-blue-600 font-bold">回覆</button>
                        {isMe && !msg.imageUrl && <button onClick={() => startEditingMessage(msg)} className="text-xs text-blue-600 hover:text-blue-800 font-bold">編輯</button>}
                        {isMe && <button onClick={() => handleUnsendMessage(msg)} className="text-xs text-red-500 hover:text-red-700 font-bold">收回</button>}
                      </div>

                      {msg.imageUrl ? (
                        <div className={`rounded-2xl overflow-hidden shadow-sm border ${isHighlighted ? 'border-blue-400 ring-4 ring-blue-200' : 'border-black/5'} transition-all`}>
                           {msg.replyTo && (
                             <div 
                               onClick={() => scrollToMessage(msg.replyTo.id)}
                               className="bg-black/80 text-white p-2 text-xs cursor-pointer hover:bg-black border-b border-white/20 transition flex flex-col"
                             >
                               <span className="font-bold text-blue-300">{msg.replyTo.senderName}</span>
                               <span className="truncate opacity-80">{msg.replyTo.text}</span>
                             </div>
                           )}
                           <img src={msg.imageUrl} alt="chat image" className="max-w-[200px] sm:max-w-[300px] h-auto object-cover block" />
                        </div>
                      ) : (
                        <div className={`w-fit min-w-[3rem] rounded-2xl px-4 py-2 shadow-sm ${isHighlighted ? 'ring-4 ring-blue-300 shadow-xl' : ''} transition-all ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white text-gray-800 rounded-tl-sm border'}`}>
                          {!isMe && <p className="text-xs text-gray-400 mb-1 font-bold">{msg.senderName}</p>}
                          
                          {msg.replyTo && (
                            <div 
                              onClick={() => scrollToMessage(msg.replyTo.id)}
                              className={`rounded p-2 mb-2 text-xs cursor-pointer transition flex flex-col border-l-4 ${isMe ? 'bg-white/20 hover:bg-white/30 border-blue-200' : 'bg-gray-100 hover:bg-gray-200 border-blue-400'}`}
                            >
                              <span className="font-bold font-sans opacity-90">{msg.replyTo.senderName}</span>
                              <span className="truncate opacity-80 mt-0.5">{msg.replyTo.text}</span>
                            </div>
                          )}

                          {editingMsgId === msg.id ? (
                            <div className="flex flex-col gap-2 min-w-[200px]">
                              <input type="text" value={editMsgText} onChange={(e) => setEditMsgText(e.target.value)} className="text-black px-2 py-1 rounded text-sm w-full outline-none" autoFocus />
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingMsgId(null)} className="text-xs opacity-80 hover:opacity-100">取消</button>
                                <button onClick={saveEditedMessage} className="text-xs font-bold bg-white text-blue-600 px-2 py-1 rounded">儲存</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                              {msg.isEdited && <p className={`text-[10px] opacity-70 text-right mt-1 font-medium ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>已編輯</p>}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {searchQuery && filteredMessages.length === 0 && (
                 <div className="text-center text-gray-400 mt-10 text-sm">找不到包含「{searchQuery}」的訊息</div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-white border-t flex flex-col relative">
              {replyingTo && (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 mx-4 mt-2 rounded-r-xl flex justify-between items-center text-sm shadow-sm">
                   <div className="flex-1 truncate mr-4">
                     <span className="font-bold text-blue-600 mr-2">回覆 {replyingTo.senderName} :</span>
                     <span className="text-gray-600">{replyingTo.imageUrl ? '[圖片]' : replyingTo.text}</span>
                   </div>
                   <button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-red-500 bg-white rounded-full p-1 shadow-sm font-bold w-6 h-6 flex items-center justify-center">✕</button>
                </div>
              )}

              {selectedImage && (
                <div className="p-3 bg-gray-50 flex items-center justify-between border-b border-gray-100 mt-2 mx-4 rounded-xl border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded overflow-hidden">
                       <img src={URL.createObjectURL(selectedImage)} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-sm text-gray-600 truncate max-w-[150px]">{selectedImage.name}</span>
                  </div>
                  <button onClick={() => setSelectedImage(null)} className="text-gray-400 hover:text-red-500 font-bold p-1" disabled={isUploading}>✕</button>
                </div>
              )}
              
              <form onSubmit={handleSendMessage} className="p-3 md:p-4 flex gap-2 items-end">
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} className="hidden" disabled={isUploading} />
                <button 
                  type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                  className="bg-gray-100 text-gray-500 p-3 rounded-full hover:bg-gray-200 transition w-12 h-12 flex items-center justify-center flex-shrink-0 disabled:opacity-50" title="傳送圖片 (最大1MB)"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                </button>
                
                {selectedImage ? (
                   <div className="flex-1 flex items-center px-4 text-sm text-gray-500 font-bold bg-gray-100 h-12 rounded-3xl">
                     即將傳送一張圖片
                   </div>
                ) : (
                  <input 
                    type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} disabled={isUploading}
                    placeholder="輸入訊息..." 
                    className="flex-1 p-3 bg-gray-100 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-500 px-6 h-12 disabled:opacity-50 disabled:bg-gray-50"
                  />
                )}
                
                <button type="submit" disabled={(!newMessage.trim() && !selectedImage) || isUploading} className="bg-blue-600 text-white p-3 rounded-full font-bold hover:bg-blue-700 disabled:bg-gray-300 transition w-12 h-12 flex items-center justify-center shadow-md flex-shrink-0">
                  {isUploading ? <span className="animate-spin text-lg">⏳</span> : '➤'}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
            <svg className="w-24 h-24 mb-4 opacity-50 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
            <p className="text-lg font-bold text-gray-500">點擊左側列表開始聊天</p>
          </div>
        )}
      </div>

      {/* --- 其餘 Modals 維持不變 --- */}
      {isEditGroupModalOpen && currentRoom?.type === 'group' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-4">編輯群組資訊</h2>
            <form onSubmit={handleEditGroupSubmit} className="space-y-4 text-left">
              <div><label className="text-sm font-bold text-gray-600">群組名稱</label><input type="text" value={editGroupForm.name} onChange={(e) => setEditGroupForm({...editGroupForm, name: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required /></div>
              <div><label className="text-sm font-bold text-gray-600">群組圖片網址</label><input type="url" value={editGroupForm.photoURL} onChange={(e) => setEditGroupForm({...editGroupForm, photoURL: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="圖片連結 (選填)" /></div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsEditGroupModalOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition">取消</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-md">儲存群組</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <h2 className="text-xl font-bold mb-4">{inviteMode ? '邀請成員加入' : '建立新群組'}</h2>
            {!inviteMode && (
              <div className="mb-4"><label className="text-sm font-bold text-gray-600">群組名稱 (選填)</label><input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full p-3 mt-1 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="輸入群組名稱..." /></div>
            )}
            <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl p-2 mb-4">
              {availableUsersToInvite.length > 0 ? availableUsersToInvite.map(u => (
                <label key={u.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                  <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => toggleUserSelect(u.id)} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                    {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover" /> : <span className="font-bold text-gray-500 text-xs">{u.username[0].toUpperCase()}</span>}
                  </div>
                  <span className="font-bold text-gray-800">{u.username}</span>
                </label>
              )) : <p className="text-center text-gray-400 p-4">沒有可以邀請的對象</p>}
            </div>
            <div className="flex gap-2 mt-auto">
              <button onClick={() => setIsGroupModalOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition">取消</button>
              <button onClick={handleGroupSubmit} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-md">{inviteMode ? '邀請加入' : '建立群組'}</button>
            </div>
          </div>
        </div>
      )}

      {isProfileOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-4">編輯個人檔案</h2>
            <form onSubmit={handleSaveProfile} className="space-y-4 text-left">
              <div><label className="text-sm font-bold text-gray-600">使用者名稱</label><input type="text" value={profileForm.username} onChange={(e) => setProfileForm({...profileForm, username: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required /></div>
              <div><label className="text-sm font-bold text-gray-600">顯示信箱 (Email)</label><input type="email" value={profileForm.email} onChange={(e) => setProfileForm({...profileForm, email: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required /><p className="text-xs text-gray-400 mt-1">此信箱將顯示給其他用戶，不影響登入帳號。</p></div>
              <div><label className="text-sm font-bold text-gray-600">頭像網址</label><input type="url" value={profileForm.photoURL} onChange={(e) => setProfileForm({...profileForm, photoURL: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="圖片連結 (選填)" /></div>
              <div><label className="text-sm font-bold text-gray-600">電話</label><input type="tel" value={profileForm.phone} onChange={(e) => setProfileForm({...profileForm, phone: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="text-sm font-bold text-gray-600">地址</label><input type="text" value={profileForm.address} onChange={(e) => setProfileForm({...profileForm, address: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsProfileOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition">取消</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-md">儲存變更</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}