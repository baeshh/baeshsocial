import { useEffect, type RefObject } from 'react'
import * as THREE from 'three'

export function useLandingBackground(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0xf8f9fa, 0.0016)

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 2000)
    camera.position.z = 650
    camera.position.y = 220
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    container.appendChild(renderer.domElement)

    const SEPARATION = 55
    const AMOUNTX = 65
    const AMOUNTY = 65
    const numParticles = AMOUNTX * AMOUNTY
    const positions = new Float32Array(numParticles * 3)
    const scales = new Float32Array(numParticles)
    const colors = new Float32Array(numParticles * 3)

    const color1 = new THREE.Color(0x4285f4)
    const color2 = new THREE.Color(0x9b72cb)

    let i = 0
    let j = 0
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions[i] = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2
        positions[i + 1] = 0
        positions[i + 2] = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2

        const mixRatio = (ix / AMOUNTX + iy / AMOUNTY) / 2
        const mixedColor = color1.clone().lerp(color2, mixRatio)
        colors[i] = mixedColor.r
        colors[i + 1] = mixedColor.g
        colors[i + 2] = mixedColor.b

        scales[j] = 1
        i += 3
        j++
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 5.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.NormalBlending,
    })

    const particles = new THREE.Points(geometry, material)
    scene.add(particles)

    let mouseX = 0
    let mouseY = 0
    const windowHalfX = window.innerWidth / 2
    const windowHalfY = window.innerHeight / 2

    const onMouseMove = (event: MouseEvent) => {
      mouseX = (event.clientX - windowHalfX) * 0.4
      mouseY = (event.clientY - windowHalfY) * 0.4
    }

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }

    document.addEventListener('mousemove', onMouseMove)
    window.addEventListener('resize', onResize)

    let frameId = 0
    let targetX = 0
    let targetY = 0
    let count = 0

    const animate = () => {
      frameId = requestAnimationFrame(animate)

      targetX = mouseX
      targetY = mouseY
      camera.position.x += (targetX - camera.position.x) * 0.04
      camera.position.y += (-targetY + 220 - camera.position.y) * 0.04
      camera.lookAt(scene.position)

      const positionArray = particles.geometry.attributes.position.array as Float32Array
      const scaleArray = particles.geometry.attributes.scale.array as Float32Array

      let pi = 0
      let pj = 0
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          positionArray[pi + 1] =
            Math.sin((ix + count) * 0.25) * 45 + Math.sin((iy + count) * 0.45) * 45
          scaleArray[pj] =
            (Math.sin((ix + count) * 0.25) + 1) * 1.8 + (Math.sin((iy + count) * 0.45) + 1) * 1.8
          pi += 3
          pj++
        }
      }

      particles.geometry.attributes.position.needsUpdate = true
      particles.geometry.attributes.scale.needsUpdate = true
      scene.rotation.y += 0.0008
      count += 0.04

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      cancelAnimationFrame(frameId)
      document.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [containerRef])
}
