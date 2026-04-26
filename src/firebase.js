import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  // 這裡請貼上你從 Firebase Console 複製的配置內容
  apiKey: "AIzaSyBp8qvEOmyTM5cIl36JpE9wnbXKD-fOMR0",
  authDomain: "software-studio-7a874.firebaseapp.com",
  databaseURL: "https://software-studio-7a874-default-rtdb.firebaseio.com",
  projectId: "software-studio-7a874",
  storageBucket: "software-studio-7a874.firebasestorage.app",
  messagingSenderId: "1095518903414",
  appId: "1:1095518903414:web:2b064a83eacf3d2d449357",
  measurementId: "G-QRZSZ54XWC"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 導出常用的服務，方便之後在其他元件使用
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);




// ### 步驟 5：完成第一次功能 Commit
// 現在你已經完成了基礎連線，這是一個絕佳的 Commit 時機：

// 1. **確認 `.gitignore`**：
//    [cite_start]確保你的 `.gitignore` 檔案中有包含 `node_modules/` [cite: 303]。Vite 通常會自動幫你建立好。
// 2. **提交代碼**：
//    ```bash
//    git add .
//    git commit -m "init: 完成 React 專案建立與 Firebase SDK 配置"
//    ```
// 3. **合併回主分支 (選做，或等下個小進度)**：
//    ```bash
//    git switch main
//    git merge init-project
//    git push origin main