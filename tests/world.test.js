import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { readFileSync,existsSync } from 'node:fs';
import {MapColliders} from '../src/legacy/collision.js';
import {ObstacleField} from '../src/legacy/obstacles.js';
import {sanitizeSettings,clockLabel} from '../src/settings.js';
function box(w,h,d,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d));m.position.set(x,y,z);m.updateMatrixWorld(true);return m;}
test('flyover preserves a separate ground floor, deck and overhead clearance',()=>{
 const colliders=new MapColliders([box(40,1,40,0,-.5,0),box(20,1,40,0,17.5,0)],THREE,{cell:4});
 assert.equal(colliders.floorUnder(0,0,2),0);
 assert.equal(colliders.floorUnder(0,0,19),18);
 assert.equal(colliders.ceilingOver(0,0,2),17);
 assert.equal(colliders.blocked(0,0,.5,.5,3),false);
});
test('vertical map walls block a player but allow passage beside them',()=>{
 const c=new MapColliders([box(1,10,20,0,5,0)],THREE,{cell:4});
 assert.equal(c.blocked(.4,0,.5,1,3),true);
 assert.equal(c.blocked(3,0,.5,1,3),false);
});
test('street props block the road without blocking people on the flyover',()=>{
 const o=new ObstacleField();o.add([[0,0,0,0]],3,10,4);o.build();
 assert.equal(o.blocked(0,0,.5,0,2.55),true);
 assert.equal(o.blocked(0,0,.5,18,2.55),false);
});
test('invalid saved graphics settings recover safely',()=>{
 const s=sanitizeSettings({hour:999,rain:-5,quality:'broken',exposure:NaN,ao:'yes'});
 assert.equal(s.hour,24);assert.equal(s.rain,0);assert.equal(s.quality,'high');assert.equal(s.exposure,1);assert.equal(s.ao,true);
 assert.equal(clockLabel(24),'00:00');assert.equal(clockLabel(17.25),'17:15');
});
test('Hledan GLB and all required high-resolution textures ship locally',()=>{
 const b=readFileSync(new URL('../public/models/hledan.glb',import.meta.url));
 assert.equal(b.readUInt32LE(0),0x46546c67);
 const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
 const names=json.materials.map(x=>x.name);for(const name of ['Building','Hledan_Center','Environment','Road texture'])assert.ok(names.includes(name));
 for(const file of ['hi/building_basecolor.webp','hi/hledan_basecolor.webp','hi/environment_basecolor.webp','road_basecolor.webp'])assert.ok(existsSync(new URL('../public/textures/'+file,import.meta.url)));
});
