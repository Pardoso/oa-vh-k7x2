// Configuración del proyecto Firebase (Paso 3a del LEEME).
// Estos valores NO son secretos: identifican el proyecto, no dan permiso de escritura.
export const firebaseConfig = {
  apiKey: 'AIzaSyAFf-0gLHbXsJUHens79WI1V2Zg9nbeCjg',
  authDomain: 'oa-inventario.firebaseapp.com',
  projectId: 'oa-inventario',
  storageBucket: 'oa-inventario.firebasestorage.app',
  messagingSenderId: '336590906473',
  appId: '1:336590906473:web:527793972da55dc9ec2ef8',
};

// Correo interno de la cuenta compartida (no es un correo real). Debe ser el mismo de firestore.rules
// y el que usa `npm run clave` en la carpeta watcher.
export const accesoEmail = 'acceso@oa-inventario.web.app';
