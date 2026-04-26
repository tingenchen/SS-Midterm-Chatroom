import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, updateDoc, 
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
  
  // Profile Modal
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ username: '', email: '', phone: '', address: '', photoURL: '' });
  
  const [allUsers, setAllUsers] = useState([]); 
  const [chatrooms, setChatrooms] = useState([]); 
  const [currentRoom, setCurrentRoom] = useState(null); 
  const [messages, setMessages] = useState([]); 
  const [newMessage, setNewMessage] = useState(''); 
  const [sidebarTab, setSidebarTab] = useState('chats'); 
  const messagesEndRef = useRef(null);

  // --- 群組/邀請狀態 ---
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState(false); 
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);

  // --- 編輯群組狀態 ---
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [editGroupForm, setEditGroupForm] = useState({ name: '', photoURL: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setUserData(null); setAllUsers([]); setChatrooms([]);
        setCurrentRoom(null); setMessages([]); setEmail(''); setPassword('');
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
            username: userDoc.data().username || '',
            email: userDoc.data().email || user.email, 
            phone: userDoc.data().phone || '',
            address: userDoc.data().address || '',
            photoURL: userDoc.data().photoURL || ''
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
        if (data.members && data.members.includes(user.uid)) {
          roomsList.push({ id: d.id, ...data });
        }
      });
      roomsList.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      setChatrooms(roomsList);
      
      // 【修復重點】使用函數式更新，確保繞過閉包問題，拿到最新房間資料
      setCurrentRoom(prevRoom => {
        if (!prevRoom) return null;
        const updatedRoom = roomsList.find(r => r.id === prevRoom.id);
        return updatedRoom || prevRoom;
      });
    });

    return () => { usersUnsub(); roomsUnsub(); };
  }, [user]);

  // 【修復重點】只依賴 currentRoom.id，避免改名字時重刷所有訊息
  useEffect(() => {
    if (!currentRoom?.id) { setMessages([]); return; }
    const messagesUnsub = onSnapshot(collection(db, `chatrooms/${currentRoom.id}/messages`), (snapshot) => {
      const msgs = [];
      snapshot.forEach(d => msgs.push({ id: d.id, ...d.data() }));
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    return () => messagesUnsub();
  }, [currentRoom?.id]);

  // --- 一對一聊天邏輯 ---
  const startPrivateChat = async (targetUser) => {
    const existingRoom = chatrooms.find(room => 
      room.type === 'private' && room.members.length === 2 && room.members.includes(targetUser.id)
    );
    if (existingRoom) {
      setCurrentRoom(existingRoom);
    } else {
      const newRoom = {
        type: 'private', members: [user.uid, targetUser.id],
        names: { [user.uid]: userData.username, [targetUser.id]: targetUser.username },
        createdAt: Date.now(), lastMessage: '', lastMessageTime: Date.now()
      };
      const docRef = await addDoc(collection(db, "chatrooms"), newRoom);
      setCurrentRoom({ id: docRef.id, ...newRoom });
    }
    setSidebarTab('chats');
  };

  // --- 建立/邀請群組 ---
  const openGroupModal = (isInvite = false) => {
    setInviteMode(isInvite);
    setGroupName('');
    setSelectedUsers([]);
    setIsGroupModalOpen(true);
  };

  const toggleUserSelect = (userId) => {
    setSelectedUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const handleGroupSubmit = async () => {
    if (selectedUsers.length === 0) return alert("請至少選擇一位成員！");

    if (inviteMode && currentRoom) {
      const updates = { members: arrayUnion(...selectedUsers) };
      if (currentRoom.type === 'private') {
        updates.type = 'group';
        updates.name = `${userData.username} 發起的群組`;
      }
      await updateDoc(doc(db, "chatrooms", currentRoom.id), updates);
      await addDoc(collection(db, `chatrooms/${currentRoom.id}/messages`), {
        text: `${userData.username} 邀請了新成員加入`,
        senderId: 'system', senderName: '系統', senderPhoto: '', createdAt: Date.now()
      });
    } else {
      const newRoom = {
        type: 'group',
        name: groupName.trim() || `${userData.username} 發起的群組`,
        photoURL: '', 
        members: [user.uid, ...selectedUsers],
        createdAt: Date.now(), lastMessage: '群組已建立', lastMessageTime: Date.now()
      };
      const docRef = await addDoc(collection(db, "chatrooms"), newRoom);
      setCurrentRoom({ id: docRef.id, ...newRoom });
      setSidebarTab('chats');
    }
    setIsGroupModalOpen(false);
  };

  // --- 編輯群組資料 ---
  const openEditGroupModal = () => {
    setEditGroupForm({
      name: currentRoom.name || '',
      photoURL: currentRoom.photoURL || ''
    });
    setIsEditGroupModalOpen(true);
  };

  const handleEditGroupSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, "chatrooms", currentRoom.id), {
        name: editGroupForm.name,
        photoURL: editGroupForm.photoURL
      });
      setIsEditGroupModalOpen(false);
    } catch (err) {
      alert("更新群組失敗：" + err.message);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentRoom) return;
    const msgText = newMessage.trim();
    setNewMessage(''); 
    await addDoc(collection(db, `chatrooms/${currentRoom.id}/messages`), {
      text: msgText, senderId: user.uid, senderName: userData.username,
      senderPhoto: userData.photoURL || '', createdAt: Date.now()
    });
    await updateDoc(doc(db, "chatrooms", currentRoom.id), { lastMessage: msgText, lastMessageTime: Date.now() });
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
        await setDoc(doc(db, "users", cred.user.uid), {
          email: cred.user.email, username: email.split('@')[0], address: '', phone: '', photoURL: '', createdAt: Date.now()
        });
      } else { await signInWithEmailAndPassword(auth, email, password); }
    } catch (err) { 
      if (err.code === 'auth/invalid-credential') setError('帳號或密碼錯誤！');
      else setError("認證錯誤：" + err.message); 
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider(); setError('');
    try {
      const result = await signInWithPopup(auth, provider);
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: result.user.email, username: result.user.displayName || result.user.email.split('@')[0],
          photoURL: result.user.photoURL || '', address: '', phone: '', createdAt: Date.now()
        });
      }
    } catch (err) { setError('Google 登入失敗：' + err.message); }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, "users", user.uid), {
      username: profileForm.username,
      email: profileForm.email,
      phone: profileForm.phone,
      address: profileForm.address,
      photoURL: profileForm.photoURL
    });
    setUserData(prev => ({...prev, ...profileForm})); 
    setIsProfileOpen(false); 
  };

  const availableUsersToInvite = inviteMode && currentRoom 
    ? allUsers.filter(u => !currentRoom.members.includes(u.id))
    : allUsers;

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
              <div key={room.id} onClick={() => setCurrentRoom(room)} className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition flex items-center gap-3 ${currentRoom?.id === room.id ? 'bg-blue-50' : ''}`}>
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
                <button onClick={(e) => { e.stopPropagation(); setCurrentRoom(null); }} className="md:hidden mr-3 text-blue-600 font-bold bg-blue-50 px-3 py-1 rounded-lg">←</button>
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
              
              <button onClick={() => openGroupModal(true)} className="bg-blue-50 text-blue-600 p-2 rounded-full hover:bg-blue-100 transition flex-shrink-0 ml-2" title="邀請新成員加入">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {messages.map(msg => {
                const isMe = msg.senderId === user.uid;
                const isSystem = msg.senderId === 'system';
                
                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <span className="bg-gray-200 text-gray-500 text-xs px-3 py-1 rounded-full font-medium">{msg.text}</span>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {!isMe && (
                      <div className="w-8 h-8 rounded-full bg-gray-300 mr-2 flex-shrink-0 overflow-hidden flex items-center justify-center mt-1">
                        {msg.senderPhoto ? <img src={msg.senderPhoto} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-white">{msg.senderName[0].toUpperCase()}</span>}
                      </div>
                    )}
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white text-gray-800 rounded-tl-sm border'}`}>
                      {!isMe && <p className="text-xs text-gray-400 mb-1 font-bold">{msg.senderName}</p>}
                      <p className="break-words leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t">
              <div className="flex gap-2">
                <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="輸入訊息..." className="flex-1 p-3 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 px-6" />
                <button type="submit" disabled={!newMessage.trim()} className="bg-blue-600 text-white p-3 rounded-full font-bold hover:bg-blue-700 disabled:bg-gray-300 transition w-12 h-12 flex items-center justify-center shadow-md">➤</button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
            <svg className="w-24 h-24 mb-4 opacity-50 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
            <p className="text-lg font-bold text-gray-500">點擊左側列表開始聊天</p>
          </div>
        )}
      </div>

      {/* --- 編輯群組 Modal --- */}
      {isEditGroupModalOpen && currentRoom?.type === 'group' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-4">編輯群組資訊</h2>
            <form onSubmit={handleEditGroupSubmit} className="space-y-4 text-left">
              <div>
                <label className="text-sm font-bold text-gray-600">群組名稱</label>
                <input 
                  type="text" value={editGroupForm.name} onChange={(e) => setEditGroupForm({...editGroupForm, name: e.target.value})} 
                  className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required 
                />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-600">群組圖片網址</label>
                <input 
                  type="url" value={editGroupForm.photoURL} onChange={(e) => setEditGroupForm({...editGroupForm, photoURL: e.target.value})} 
                  className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="圖片連結 (選填)" 
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsEditGroupModalOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition">取消</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-md">儲存群組</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- 群組邀請/建立 Modal --- */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <h2 className="text-xl font-bold mb-4">{inviteMode ? '邀請成員加入' : '建立新群組'}</h2>
            
            {!inviteMode && (
              <div className="mb-4">
                <label className="text-sm font-bold text-gray-600">群組名稱 (選填)</label>
                <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full p-3 mt-1 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="輸入群組名稱..." />
              </div>
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
              )) : (
                <p className="text-center text-gray-400 p-4">沒有可以邀請的對象</p>
              )}
            </div>

            <div className="flex gap-2 mt-auto">
              <button onClick={() => setIsGroupModalOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition">取消</button>
              <button onClick={handleGroupSubmit} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-md">
                {inviteMode ? '邀請加入' : '建立群組'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {isProfileOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-4">編輯個人檔案</h2>
            <form onSubmit={handleSaveProfile} className="space-y-4 text-left">
              <div>
                <label className="text-sm font-bold text-gray-600">使用者名稱</label>
                <input type="text" value={profileForm.username} onChange={(e) => setProfileForm({...profileForm, username: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-600">顯示信箱 (Email)</label>
                <input type="email" value={profileForm.email} onChange={(e) => setProfileForm({...profileForm, email: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required />
                <p className="text-xs text-gray-400 mt-1">此信箱將顯示給其他用戶，不影響登入帳號。</p>
              </div>
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