import { LazyMotion, MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const loadFeatures = () => import('./lib/motionFeatures').then((mod) => mod.default)

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
)
