const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyDummyKeyForCompatibilityOnly",
  authDomain: "codizulca-fdv.firebaseapp.com",
  projectId: "codizulca-fdv",
  storageBucket: "codizulca-fdv.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function dump() {
  try {
    const snap = await getDocs(collection(db, "degustaciones"));
    console.log("Total docs in Firestore:", snap.docs.length);
    snap.docs.forEach(d => {
      const data = d.data();
      console.log(`[${d.id}] ${data.clienteNombre} | ${data.fecha} | Turno: ${data.turno} | Estado: ${data.estado} | Vendedor: ${data.vendedorNombre} | Productos: ${JSON.stringify(data.productos)}`);
    });
  } catch(e) {
    console.error("Firestore error:", e.message);
  }
}
dump();
