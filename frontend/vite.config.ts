import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ['reachinbox-assignment-production-b2b3.up.railway.app'],
  },
})