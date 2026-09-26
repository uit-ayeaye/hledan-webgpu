import * as THREE from 'three/webgpu';
import { uniform, float, vec2, vec3, vec4, Fn, If, hash, instanceIndex, instancedArray, positionLocal, positionWorld, normalWorld, normalLocal, texture, mx_noise_float, sin, cos, time, mix, smoothstep, uv, bumpMap, instancedBufferAttribute } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';

// A GPU particle integrator with gravity, wind, terminal speed, and collision
// against a height field baked from the actual roofs / flyover / road meshes.
export class Rain {
  constructor(scene, renderer, solids) {
    this.renderer=renderer;this.count=18000;this.amount=uniform(0);this.dt=uniform(0);this.clock=uniform(0);
    const n=128, data=new Float32Array(n*n*4);
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){const i=(z*n+x)*4;data[i]=solids.topAt((x+.5)/n*900-450,(z+.5)/n*1300-450)??40;data[i+3]=1;}
    const height=new THREE.DataTexture(data,n,n,THREE.RGBAFormat,THREE.FloatType);height.minFilter=height.magFilter=THREE.NearestFilter;height.needsUpdate=true;
    const positions=instancedArray(this.count,'vec3'), speeds=instancedArray(this.count,'float');
    this.init=Fn(()=>{const p=positions.element(instanceIndex);p.assign(vec3(hash(instanceIndex).mul(900).sub(450),hash(instanceIndex.add(37)).mul(320).add(45),hash(instanceIndex.add(71)).mul(1300).sub(450)));speeds.element(instanceIndex).assign(hash(instanceIndex.add(17)).mul(35).add(30));})().compute(this.count);
    this.compute=Fn(()=>{const p=positions.element(instanceIndex),speed=speeds.element(instanceIndex);speed.assign(speed.add(this.dt.mul(32)).min(85));p.y.subAssign(speed.mul(this.dt));p.x.addAssign(this.dt.mul(8));p.z.addAssign(this.dt.mul(3));const ground=texture(height,vec2(p.x.add(450).div(900),p.z.add(450).div(1300))).level(0).r;
      If(p.y.lessThan(ground.add(.3)).or(p.x.greaterThan(450)).or(p.z.greaterThan(850)),()=>{p.x.assign(hash(instanceIndex.add(this.clock.mul(17).floor())).mul(900).sub(450));p.z.assign(hash(instanceIndex.add(this.clock.mul(13).floor()).add(11)).mul(1300).sub(450));p.y.assign(float(340).add(hash(instanceIndex).mul(45)));speed.assign(35);});
    })().compute(this.count);
    const mat=new THREE.SpriteNodeMaterial({color:0xc8dee1,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    mat.positionNode=positions.toAttribute();
    mat.scaleNode=vec2(.10,2.5);
    mat.opacityNode=this.amount.mul(.36);
    const geo=new THREE.PlaneGeometry(1,1);
    this.mesh=new THREE.Mesh(geo,mat);this.mesh.count=this.count;this.mesh.frustumCulled=false;this.mesh.visible=false;scene.add(this.mesh);
    renderer.compute(this.init);
    const splashPositions=new Float32Array(900*3);
    for(let i=0;i<900;i++){const x=((i*137.508)%900)-450,z=((i*293.317)%1300)-450;splashPositions.set([x,(solids.topAt(x,z)??40)+.06,z],i*3);}
    const splashMat=new THREE.MeshBasicNodeMaterial({color:0xb9d0cb,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const phase=this.clock.mul(1.7).add(hash(instanceIndex)).fract();
    splashMat.positionNode=positionLocal.mul(phase.mul(2).add(.2)).add(instancedBufferAttribute(new THREE.InstancedBufferAttribute(splashPositions,3)));
    const radius=uv().sub(.5).length();
    splashMat.opacityNode=smoothstep(.32,.40,radius).mul(float(1).sub(smoothstep(.42,.49,radius))).mul(float(1).sub(phase)).mul(this.amount).mul(.55);
    this.splashes=new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2),splashMat);this.splashes.count=900;this.splashes.frustumCulled=false;scene.add(this.splashes);

  }
  update(dt,amount,elapsed){this.amount.value=amount;this.mesh.visible=amount>.025;this.splashes.visible=this.mesh.visible;if(!this.mesh.visible)return;this.dt.value=dt;this.clock.value=elapsed;this.renderer.compute(this.compute);}
}

export class Atmosphere {
  constructor(scene,renderer,camera) {
    Object.assign(this,{scene,renderer,camera});this.wet=uniform(0);this.t=uniform(0);this.materials=[];
    this.sky=new SkyMesh();this.sky.scale.setScalar(8000);this.sky.rayleigh.value=1.6;this.sky.turbidity.value=4;this.sky.cloudScale.value=.0004;this.sky.cloudSpeed.value=.00005;this.sky.cloudCoverage.value=.28;scene.add(this.sky);
    this.sun=new THREE.DirectionalLight(0xffdfaa,2.5);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-330;this.sun.shadow.camera.right=330;this.sun.shadow.camera.top=330;this.sun.shadow.camera.bottom=-330;this.sun.shadow.camera.near=1;this.sun.shadow.camera.far=1800;this.sun.shadow.bias=-.0003;this.sun.shadow.normalBias=.15;this.sun.shadow.camera.updateProjectionMatrix();this.sun.target.position.set(0,45,150);scene.add(this.sun,this.sun.target);
    this.hemi=new THREE.HemisphereLight(0xe4efff,0x888068,2);this.fill=new THREE.AmbientLight(0xffffff,.3);scene.add(this.hemi,this.fill);
    scene.fog=new THREE.FogExp2(0xc7c7b1,.0006);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(4500,64).rotateX(-Math.PI/2),new THREE.MeshStandardNodeMaterial({color:0x78816b,roughness:1}));floor.position.y=0;scene.add(floor);
    // Coarse environment reflection generated once; lighting and sky animate independently.
    this.envGenerator=new THREE.PMREMGenerator(renderer);
    this.stars=this.makeStars();scene.add(this.stars);
  }
  makeStars(){let data=new Float32Array(1300*3);for(let i=0;i<1300;i++){const a=i*2.3999632297,y=.1+((i*137)%1300)/1500,r=Math.sqrt(1-y*y);data.set([Math.cos(a)*r*3500,y*3500,Math.sin(a)*r*3500],i*3);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(data,3));return new THREE.Points(g,new THREE.PointsMaterial({color:0xdce8ff,size:2.4,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false}));}
  async environment(){const s=new THREE.Scene();const clone=new SkyMesh();clone.scale.setScalar(8000);clone.sunPosition.value.copy(this.sky.sunPosition.value);clone.showSunDisc.value=0;clone.cloudCoverage.value=.35;s.add(clone);this.env=this.envGenerator.fromScene(s,.03,.1,10000);this.scene.environment=this.env.texture;clone.geometry.dispose();clone.material.dispose();}
  material(name,map,roughnessMap){
    const road=name==='Road texture',m=new THREE.MeshPhysicalNodeMaterial({map,roughnessMap:roughnessMap??null,roughness:road?.85:.93,metalness:0,side:THREE.DoubleSide,alphaTest:road?0:.5,clearcoat:0,emissiveMap:map,emissive:0xffd1a0,emissiveIntensity:.06});m.name=name;
    // Wet horizontal surfaces darken and become specular. Fragment world-space
    // noise keeps puddle edges stable as the camera moves (no screen-space swimming).
    const patch=smoothstep(-.12,.34,mx_noise_float(positionWorld.xz.mul(.10)));
    const horizontal=smoothstep(.72,.95,normalWorld.y.abs());
    const wet=this.wet.mul(horizontal).mul(patch);
    m.roughnessNode=mix(float(.9),float(.13),wet);
    if(road)m.normalNode=bumpMap(sin(positionWorld.x.mul(5).add(this.t.mul(9))).mul(cos(positionWorld.z.mul(6).sub(this.t.mul(7)))).mul(wet).mul(.025));
    m.clearcoatNode=wet.mul(.8);m.clearcoatRoughnessNode=float(.12);
    m.opacityNode=texture(map).a;
    m.colorNode=texture(map).rgb.mul(float(1).sub(wet.mul(.22)));
    this.materials.push(m);return m;
  }
  update(dt,s,elapsed){
    this.t.value=elapsed;this.wet.value=THREE.MathUtils.damp(this.wet.value,s.rain, .22,dt);
    const theta=(s.hour-6)/12*Math.PI,alt=Math.sin(theta),day=THREE.MathUtils.smoothstep(alt,-.13,.15),warm=1-THREE.MathUtils.smoothstep(alt,0,.5);
    const dir=new THREE.Vector3(-Math.cos(theta)*.85,alt,Math.cos(theta)*.5).normalize();
    this.sky.sunPosition.value.copy(dir).multiplyScalar(4000);this.sky.visible=day>.03;
    this.sky.cloudCoverage.value=.28+s.rain*.64;this.sky.cloudDensity.value=.35+s.rain*.5;this.sky.turbidity.value=3.5+s.haze*5+s.rain*6;
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir,850);this.sun.intensity=day*(2.1+warm*.4)*(1-s.rain*.84);this.sun.color.set(0xfff4dc).lerp(new THREE.Color(0xffae66),warm*.6);
    this.hemi.intensity=.24+day*1.65;this.fill.intensity=.14+day*.3;this.hemi.color.set(0xaecbdf).lerp(new THREE.Color(0xffdfac),warm*.35);
    this.scene.background=new THREE.Color(0x0b1425);this.scene.environmentIntensity=.17+day*.65;
    const fog=new THREE.Color(0xc5c9b8).lerp(new THREE.Color(0xd9b18a),warm*.6).lerp(new THREE.Color(0x8cabae),s.rain*.75).lerp(new THREE.Color(0x182739),1-day);
    this.scene.fog.color.copy(fog);this.scene.fog.density=.00022+s.haze*.00065+s.rain*.0011;
    this.stars.material.opacity=(1-day)*(1-s.rain);this.stars.visible=day<.95;
    for(const m of this.materials)m.emissiveIntensity=.015+(1-day)*.19;
    this.renderer.toneMappingExposure=s.exposure*(.95+(1-day)*.25);
    this.night=1-day;return this.night;
  }
}
