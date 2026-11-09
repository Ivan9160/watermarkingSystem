import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = {
    '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
        xfwd: true,      
    },
    '/waterm-storage': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true, 
        rewrite: (path: string) => path.replace(/^\/waterm-storage/, ''),
    },
};

export default defineConfig({
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { proxy },
});
