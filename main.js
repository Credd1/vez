const { app } = require('electron');
app.whenReady().then(() => {
  console.log('Electron ready');
  app.quit();
});
