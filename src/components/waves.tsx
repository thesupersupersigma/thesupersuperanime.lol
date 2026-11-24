'use client'
import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '@/lib/motion'

/**
 * The particle wave from design/mockups/Waves.dc.html: one Points + BufferGeometry (140×20 = 2 800 points).
 * three.js loads only on the client, the loop stops while off-screen or the tab is hidden, reduced motion gets one
 * still frame, and everything is disposed on unmount. No WebGL → the canvas stays empty.
 */
export function Waves({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    let dead = false
    let cleanup = () => {}

    import('three').then((T) => {
      if (dead) return
      let renderer: import('three').WebGLRenderer
      try {
        renderer = new T.WebGLRenderer({ canvas: c, alpha: true, antialias: true })
      } catch {
        return
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
      const scene = new T.Scene()
      const camera = new T.PerspectiveCamera(40, 1, 0.1, 100)
      camera.position.set(0, 2.2, 7.5)
      camera.lookAt(0, 0, 0)

      const COLS = 140
      const ROWS = 20
      const COUNT = COLS * ROWS
      const pos = new Float32Array(COUNT * 3)
      const base = new Float32Array(COUNT * 2)
      for (let r = 0, n = 0; r < ROWS; r++)
        for (let q = 0; q < COLS; q++, n++) {
          const x = (q / (COLS - 1) - 0.5) * 22
          const z = (r / (ROWS - 1) - 0.5) * 6
          base[n * 2] = x
          base[n * 2 + 1] = z
          pos[n * 3] = x
          pos[n * 3 + 2] = z
        }
      const geo = new T.BufferGeometry()
      const attr = new T.BufferAttribute(pos, 3)
      geo.setAttribute('position', attr)
      const mat = new T.PointsMaterial({
        color: 0xf5f5f5,
        size: 0.045,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
      scene.add(new T.Points(geo, mat))

      const draw = (t: number) => {
        for (let n = 0; n < COUNT; n++) {
          const x = base[n * 2]!
          const z = base[n * 2 + 1]!
          pos[n * 3 + 1] = Math.sin(x * 0.55 + t * 0.9) * 0.28 + Math.cos(z * 1.4 + x * 0.15 + t * 0.6) * 0.18
        }
        attr.needsUpdate = true
        renderer.render(scene, camera)
      }
      const size = () => {
        const w = c.clientWidth
        const h = c.clientHeight || 1
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        if (!running()) draw(0)
      }

      let onScreen = true
      let raf = 0
      const running = () => onScreen && document.visibilityState === 'visible' && !prefersReducedMotion()
      const loop = (ms: number) => {
        draw(ms / 1000)
        raf = running() ? requestAnimationFrame(loop) : 0
      }
      const kick = () => {
        if (running() && !raf) raf = requestAnimationFrame(loop)
      }

      const ro = new ResizeObserver(size)
      ro.observe(c)
      const io = new IntersectionObserver(([e]) => {
        onScreen = Boolean(e?.isIntersecting)
        kick()
      })
      io.observe(c)
      document.addEventListener('visibilitychange', kick)
      size()
      kick()

      cleanup = () => {
        cancelAnimationFrame(raf)
        ro.disconnect()
        io.disconnect()
        document.removeEventListener('visibilitychange', kick)
        geo.dispose()
        mat.dispose()
        renderer.dispose()
      }
    })

    return () => {
      dead = true
      cleanup()
    }
  }, [])

  return <canvas ref={canvas} aria-hidden className={className ?? 'block h-full w-full'} />
}
