import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { initializeAuth, browserLocalPersistence, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getCount, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js';

let backend;
export async function connectLikes(config, articleId) {
  if (!backend) {
    const app = initializeApp(config, 'article-likes');
    backend = { auth: initializeAuth(app, { persistence: browserLocalPersistence }), db: getFirestore(app) };
  }
  const { auth, db } = backend;
  await auth.authStateReady();
  const votes = collection(db, 'articleLikes', articleId, 'votes');
  return {
    async read() {
      const [total, own] = await Promise.all([
        getCount(votes),
        auth.currentUser ? getDoc(doc(votes, auth.currentUser.uid)) : null
      ]);
      return { count: total.data().count, liked: Boolean(own?.exists()) };
    },
    async setLiked(liked) {
      if (!auth.currentUser) await signInAnonymously(auth);
      const vote = doc(votes, auth.currentUser.uid);
      // One document per visitor; repeated requests cannot inflate the count.
      // The Lite SDK sends directly to the server, without an offline write queue.
      if (liked) await setDoc(vote, { liked: true });
      else await deleteDoc(vote);
    }
  };
}
