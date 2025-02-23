export default {
  server: {
    host: '0.0.0.0',
    allowedHosts: ['localhost', '127.0.0.1', 'neurocorengine.com'],
    proxy: {
      '/neurocorengine': {
        target: 'https://neurocorengine.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/neurocorengine/, '')
      }
    }
  }
} 