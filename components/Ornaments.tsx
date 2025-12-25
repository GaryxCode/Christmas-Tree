
import React, { useMemo, useRef, useLayoutEffect, useState, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { lerp, randomVector3 } from '../utils/math';

interface OrnamentData {
  chaosPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  rotation: THREE.Euler;
  color: THREE.Color;
  targetScale: THREE.Vector3;
  chaosScale: THREE.Vector3;
  chaosTilt: number;
}

interface OrnamentsProps {
  mixFactor: number;
  type: 'BALL' | 'BOX' | 'STAR' | 'CANDY' | 'CRYSTAL' | 'PHOTO';
  count: number;
  colors?: string[];
  scale?: number;
  userImages?: string[];
  signatureText?: string;
}

// --- Procedural Geometry Generators ---

const createCandyCaneGeometry = () => {
    const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -1.0, 0),
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0.1, 0.8, 0),
        new THREE.Vector3(0.4, 0.9, 0),
        new THREE.Vector3(0.6, 0.6, 0) 
    ]);
    const geometry = new THREE.TubeGeometry(path, 32, 0.12, 8, false);
    geometry.center();
    return geometry;
};

const createStarGeometry = (points: number, outerRadius: number, innerRadius: number, depth: number) => {
    const shape = new THREE.Shape();
    const step = (Math.PI * 2) / (points * 2);
    shape.moveTo(0, outerRadius);
    for(let i = 0; i < points * 2; i++) {
        const radius = (i % 2 === 0) ? outerRadius : innerRadius;
        const angle = i * step;
        shape.lineTo(Math.sin(angle) * radius, Math.cos(angle) * radius);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: depth,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
        bevelSegments: 2
    });
    geometry.center();
    return geometry;
};

const generateCandyStripeTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#cc0000';
    for (let i = -128; i < 256; i += 42) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 20, 0);
        ctx.lineTo(i + 20 + 128, 128);
        ctx.lineTo(i + 128, 128);
        ctx.closePath();
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 1); 
    return tex;
}

const generateSignatureTexture = (text: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!text) return new THREE.CanvasTexture(canvas);
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "bold 60px 'Monsieur La Doulaise', cursive";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
}

// --- Base Mesh Component for Photos & Videos ---
const PhotoFrameMesh: React.FC<{
    item: OrnamentData;
    mixFactor: number;
    texture: THREE.Texture;
    signatureTexture?: THREE.Texture | null;
}> = ({ item, mixFactor, texture, signatureTexture }) => {
    const groupRef = useRef<THREE.Group>(null);
    const innerRef = useRef<THREE.Group>(null); 
    const photoMatRef = useRef<THREE.MeshStandardMaterial>(null);
    const currentMixRef = useRef(1);
    
    const vecPos = useMemo(() => new THREE.Vector3(), []);
    const vecScale = useMemo(() => new THREE.Vector3(), []);
    const vecWorld = useMemo(() => new THREE.Vector3(), []);

    const layout = useMemo(() => {
        let width = 1;
        let height = 1;
        
        if (texture instanceof THREE.VideoTexture) {
             const vid = texture.image as HTMLVideoElement;
             width = vid?.videoWidth || 1;
             height = vid?.videoHeight || 1;
        } else {
             const img = texture.image as any;
             width = img?.width || 1;
             height = img?.height || 1;
        }
        
        const aspect = width / height;
        const maxSize = 0.85;
        let pw, ph;
        if (aspect >= 1) {
            pw = maxSize;
            ph = maxSize / aspect;
        } else {
            ph = maxSize;
            pw = maxSize * aspect;
        }
        const mSide = 0.08;
        const mTop = 0.08;
        const mBottom = 0.20;
        const fw = pw + mSide * 2;
        const fh = ph + mTop + mBottom;
        const py = (fh / 2) - mTop - (ph / 2);
        const ty = -(fh / 2) + (mBottom / 2);
        return {
            frameArgs: [fw, fh, 0.05] as [number, number, number],
            photoArgs: [pw, ph] as [number, number],
            photoPos: [0, py, 0.03] as [number, number, number],
            textPos: [0, ty, 0.03] as [number, number, number],
            textArgs: [fw, mBottom] as [number, number]
        };
    }, [texture]);

    useFrame((state, delta) => {
        if (!groupRef.current || !innerRef.current) return;
        const speed = 2.0 * delta;
        currentMixRef.current = lerp(currentMixRef.current, mixFactor, speed);
        const t = currentMixRef.current;

        // CRITICAL: Protection against invalid vectors
        if (isNaN(item.chaosPos.x) || isNaN(item.targetPos.x)) return;

        vecPos.lerpVectors(item.chaosPos, item.targetPos, t);
        groupRef.current.position.copy(vecPos);
        
        vecScale.lerpVectors(item.chaosScale, item.targetScale, t);
        const { width: viewportWidth } = state.viewport;
        const responsiveBaseScale = viewportWidth < 22 ? 0.6 : 1.0;
        vecScale.multiplyScalar(responsiveBaseScale);
        
        const effectStrength = (1.0 - t);
        if (t < 0.99) {
             groupRef.current.getWorldPosition(vecWorld);
             const distToCamera = vecWorld.distanceTo(state.camera.position);
             const perspectiveFactor = THREE.MathUtils.mapLinear(distToCamera, 10, 60, 1.5, 0.6);
             vecScale.multiplyScalar(lerp(1.0, perspectiveFactor, effectStrength));
             if (photoMatRef.current) {
                 photoMatRef.current.emissiveIntensity = Math.max(0.2, 0.9 * effectStrength);
             }
        }
        groupRef.current.scale.copy(vecScale);

        if (t > 0.8) {
             groupRef.current.lookAt(0, groupRef.current.position.y, 0); 
             groupRef.current.rotateY(Math.PI); 
             innerRef.current.rotation.z = lerp(innerRef.current.rotation.z, 0, speed);
        } else {
             groupRef.current.lookAt(state.camera.position);
             innerRef.current.rotation.z = lerp(innerRef.current.rotation.z, item.chaosTilt, speed);
        }
    });

    return (
        <group ref={groupRef}>
            <group ref={innerRef}>
                <mesh>
                    <boxGeometry args={layout.frameArgs} />
                    <meshStandardMaterial color="#ffffff" roughness={1.0} metalness={0.0} emissive="#ffffff" emissiveIntensity={0.6} toneMapped={false} />
                </mesh>
                <mesh position={layout.photoPos}>
                    <planeGeometry args={layout.photoArgs} />
                    <meshStandardMaterial ref={photoMatRef} map={texture} emissiveMap={texture} roughness={0.4} metalness={0.0} color="white" emissive="white" emissiveIntensity={0.25} toneMapped={false} />
                </mesh>
                {signatureTexture && (
                    <mesh position={layout.textPos}>
                        <planeGeometry args={layout.textArgs} />
                        <meshBasicMaterial map={signatureTexture} transparent={true} opacity={0.85} depthWrite={false} />
                    </mesh>
                )}
            </group>
        </group>
    );
};

// --- Video Support Components ---

const VideoFrameMesh: React.FC<{
    item: OrnamentData;
    mixFactor: number;
    url: string;
    signatureTexture?: THREE.Texture | null;
}> = ({ item, mixFactor, url, signatureTexture }) => {
    const [isReady, setIsReady] = useState(false);
    
    const [video] = useState(() => {
        const v = document.createElement('video');
        v.src = url;
        v.crossOrigin = "Anonymous";
        v.loop = true;
        v.muted = true;
        v.playsInline = true;
        v.onloadedmetadata = () => setIsReady(true);
        v.play().catch(() => {});
        return v;
    });

    const texture = useMemo(() => new THREE.VideoTexture(video), [video]);

    useEffect(() => {
        return () => {
            video.pause();
            video.src = "";
            video.load();
            texture.dispose();
        };
    }, [video, texture]);

    // Safety: Render a placeholder until metadata (width/height) is known to avoid NaN scales
    if (!isReady) {
        return (
            <group position={item.targetPos}>
                <mesh scale={item.targetScale}>
                    <boxGeometry args={[1, 1.2, 0.05]} />
                    <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
                </mesh>
            </group>
        );
    }

    return <PhotoFrameMesh item={item} mixFactor={mixFactor} texture={texture} signatureTexture={signatureTexture} />;
};

const UserMediaOrnament: React.FC<{
    item: OrnamentData;
    mixFactor: number;
    url: string;
    signatureTexture?: THREE.Texture | null;
}> = ({ item, mixFactor, url, signatureTexture }) => {
    const isVideo = url.startsWith('data:video') || url.endsWith('.mp4') || url.endsWith('.webm');

    if (isVideo) {
        return <VideoFrameMesh item={item} mixFactor={mixFactor} url={url} signatureTexture={signatureTexture} />;
    }
    
    const texture = useLoader(THREE.TextureLoader, url);
    return <PhotoFrameMesh item={item} mixFactor={mixFactor} texture={texture} signatureTexture={signatureTexture} />;
};

const SuspenseMediaOrnament = (props: any) => {
     return (
        <React.Suspense fallback={null}>
            <UserMediaOrnament {...props} />
        </React.Suspense>
    )
}

// --- Gift Box & Main Ornaments Logic ---

const GiftBoxMesh: React.FC<{
    item: OrnamentData;
    mixFactor: number;
}> = ({ item, mixFactor }) => {
    const groupRef = useRef<THREE.Group>(null);
    const currentMixRef = useRef(1);
    const vecPos = useMemo(() => new THREE.Vector3(), []);
    const vecScale = useMemo(() => new THREE.Vector3(), []);
    
    const ribbonMaterial = useMemo(() => {
        const c = item.color;
        const luminance = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
        let ribColorStr = "#FFD700";
        if (c.b > c.r + 0.2 && c.b > c.g + 0.2) ribColorStr = "#E0E0E0";
        else if (luminance > 0.6) ribColorStr = "#AA0000";
        return new THREE.MeshStandardMaterial({ color: ribColorStr, roughness: 0.2, metalness: 0.8, emissive: ribColorStr, emissiveIntensity: 0.2 });
    }, [item.color]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        const t = currentMixRef.current = lerp(currentMixRef.current, mixFactor, 2.0 * delta);
        vecPos.lerpVectors(item.chaosPos, item.targetPos, t);
        groupRef.current.position.copy(vecPos);
        vecScale.lerpVectors(item.chaosScale, item.targetScale, t);
        groupRef.current.scale.copy(vecScale);
        groupRef.current.rotation.copy(item.rotation);
        if (t < 0.5) { groupRef.current.rotation.x += delta; groupRef.current.rotation.y += delta; }
    });

    return (
        <group ref={groupRef}>
            <mesh castShadow receiveShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={item.color} roughness={0.4} /></mesh>
            <mesh scale={[0.2, 1.01, 1.01]} material={ribbonMaterial}><boxGeometry args={[1, 1, 1]} /></mesh>
            <mesh scale={[1.01, 1.01, 0.2]} material={ribbonMaterial}><boxGeometry args={[1, 1, 1]} /></mesh>
            <mesh position={[0, 0.5, 0]} rotation={[0, Math.PI / 4, 0]} material={ribbonMaterial} scale={[0.35, 0.35, 0.35]}><torusKnotGeometry args={[0.6, 0.15, 64, 8, 2, 3]} /></mesh>
        </group>
    );
};

const generateCardTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#222222'; ctx.fillRect(0,0, 128, 160); }
    return new THREE.CanvasTexture(canvas);
}

const Ornaments: React.FC<OrnamentsProps> = ({ mixFactor, type, count, colors, scale = 1, userImages = [], signatureText }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const currentMixRef = useRef(1);

  const candyTexture = useMemo(() => type === 'CANDY' ? generateCandyStripeTexture() : null, [type]);
  const signatureTexture = useMemo(() => (type === 'PHOTO' && signatureText) ? generateSignatureTexture(signatureText) : null, [type, signatureText]);

  const geometry = useMemo(() => {
      switch(type) {
          case 'CANDY': return createCandyCaneGeometry();
          case 'CRYSTAL': return createStarGeometry(6, 1.0, 0.3, 0.1); 
          case 'STAR': return createStarGeometry(5, 1.0, 0.5, 0.2);
          case 'BALL': return new THREE.SphereGeometry(1, 16, 16);
          default: return new THREE.BoxGeometry(1, 1, 1);
      }
  }, [type]);

  const data = useMemo(() => {
    const items: OrnamentData[] = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); 
    const treeHeight = 18, treeRadiusBase = 7.5, apexY = 9; 
    const angleOffset = (type === 'BALL' ? 0 : type === 'BOX' ? 1 : 2) * (Math.PI / 3);

    for (let i = 0; i < count; i++) {
      const progress = Math.sqrt((i + 1) / count) * 0.9; 
      const theta = i * goldenAngle + angleOffset;
      const x = progress * treeRadiusBase * Math.cos(theta);
      const z = progress * treeRadiusBase * Math.sin(theta);
      const tPos = new THREE.Vector3(x, apexY - progress * treeHeight, z);
      tPos.multiplyScalar((type === 'STAR' || type === 'PHOTO') ? 1.15 : 1.08);

      let cPos = type === 'PHOTO' ? new THREE.Vector3(18 * Math.cos(i * goldenAngle), ((i / count) - 0.5) * 12, 18 * Math.sin(i * goldenAngle)) : randomVector3(25);
      
      const targetScale = new THREE.Vector3(1, 1, 1).multiplyScalar(scale * (Math.random() * 0.4 + 0.8));
      if (type === 'PHOTO') targetScale.multiplyScalar(0.8);

      items.push({ chaosPos: cPos, targetPos: tPos, rotation: new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, 0), color: new THREE.Color(colors ? colors[Math.floor(Math.random() * colors.length)] : '#fff'), targetScale, chaosScale: targetScale.clone().multiplyScalar(type === 'PHOTO' ? 4 : 1), chaosTilt: ((i % 5) - 2) * 0.15 });
    }
    return items;
  }, [count, type, colors, scale]);

  const fallbackTexture = useMemo(() => type === 'PHOTO' ? generateCardTexture() : null, [type]);

  useLayoutEffect(() => {
     if (!meshRef.current || type === 'PHOTO' || type === 'BOX') return;
     data.forEach((item, i) => {
         meshRef.current!.setColorAt(i, type === 'CANDY' ? new THREE.Color('#fff') : item.color);
         dummy.position.copy(item.targetPos); dummy.scale.copy(item.targetScale); dummy.rotation.copy(item.rotation);
         dummy.updateMatrix(); meshRef.current!.setMatrixAt(i, dummy.matrix);
     });
     if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
     meshRef.current.instanceMatrix.needsUpdate = true;
  }, [data, type, dummy]);

  useFrame((state, delta) => {
    if (!meshRef.current || type === 'PHOTO' || type === 'BOX') return;
    const t = currentMixRef.current = lerp(currentMixRef.current, mixFactor, 2.0 * delta);
    data.forEach((item, i) => {
      dummy.position.lerpVectors(item.chaosPos, item.targetPos, t);
      if (type === 'STAR' && t > 0.8) { dummy.lookAt(0, dummy.position.y, 0); dummy.rotateZ(Math.PI / 2); }
      else { dummy.rotation.copy(item.rotation); if (t < 0.5) { dummy.rotation.x += delta; dummy.rotation.y += delta; } }
      dummy.scale.lerpVectors(item.chaosScale, item.targetScale, t);
      dummy.updateMatrix(); meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (type === 'PHOTO') {
      return (
          <group>
              {data.map((item, i) => {
                  const src = (userImages && i < userImages.length) ? userImages[i] : null;
                  if (src) return <SuspenseMediaOrnament key={i} item={item} mixFactor={mixFactor} url={src} signatureTexture={signatureTexture} />;
                  return <PhotoFrameMesh key={i} item={item} mixFactor={mixFactor} texture={fallbackTexture!} signatureTexture={signatureTexture} />;
              })}
          </group>
      )
  }

  if (type === 'BOX') return <group>{data.map((item, i) => <GiftBoxMesh key={i} item={item} mixFactor={mixFactor} />)}</group>;

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, count]}>
      <meshStandardMaterial map={candyTexture} roughness={0.2} metalness={type === 'CRYSTAL' ? 0.9 : 0.5} />
    </instancedMesh>
  );
};

export default Ornaments;
