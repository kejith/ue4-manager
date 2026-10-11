// Dependency-free frontend smoke test. Executes each page renderer with realistic fixtures.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const dom={innerHTML:''};
const fixture={
 '/me':{username:'Fixture Commander'},
 '/me/planets':{planets:[{id:1,name:'Fixture Prime',resources:{ore:1050,crystal:500},coordinates:{x:1,y:2}}]},
 '/me/fleets':{fleets:[{id:2,name:'Fixture Wing',status:'Idle',ships:[{id:3,name:'Corvette'}]}]},
 '/me/tasks':{tasks:[{id:4,name:'Research complete soon',endsAt:1791900000}]},
 '/me/research':{technologies:[{id:5,name:'Engineers',level:3}]},
 '/me/commanders':{commanders:[{id:6,name:'Scientist A'}]},
 '/me/pa':{budget:1200,used:200},
 '/me/vision':{systems:[{id:7,name:'Home',x:1,y:2},{id:8,name:'Next',x:4,y:5}]},
 '/me/relations':{empires:[{id:9,name:'Alliance A'}]},
 '/reference':{version:'1'},
 '/reference/ships':{ships:[{id:10,name:'Corvette',hp:99}]},
 '/reference/modules':{modules:[{id:11,name:'Shield'}]},
 '/reference/buildings':{buildings:[{id:12,name:'Mine'}]},
 '/reference/research':{research:[{id:13,name:'Physics'}]},
 '/reference/constants':{constants:{speed:100}}
};
const endpoints=Object.keys(fixture);
const snapshot={endpoints:Object.fromEntries(endpoints.map(p=>[p,{updatedAt:1791000000,data:fixture[p]}]))};
const mockFetch=async url=>({ok:true,json:async()=> url==='/api/status'?{configured:true,usage:{remaining:40,limit:50,used:10},cache:Object.fromEntries(endpoints.map(p=>[p,1791000000])),endpoints,core:endpoints.slice(0,9),reference:endpoints.slice(9)}:url==='/api/snapshot'?snapshot:{snapshots:[]}});
const ctx=vm.createContext({document:{querySelector:()=>dom,addEventListener:()=>{}},fetch:mockFetch,location:{host:'ue4.sane.run'},window:{scrollTo:()=>{}},navigator:{},Intl,Date,Math,Number,JSON,String,Object,Array,Map,Set,RegExp,URL,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem:()=>{}},console});
vm.runInContext(fs.readFileSync('web/app.js','utf8'),ctx,{filename:'web/app.js'});
setTimeout(()=>{
 try{
  for(const v of ['overview','planets','fleets','tasks','research','commanders','pa','vision','relations','analytics','catalog','explorer','settings']){
   vm.runInContext(`state.view=${JSON.stringify(v)};render()`,ctx);
   assert.ok(dom.innerHTML.includes('UE4 MANAGER'),`${v}: shell missing`);
   assert.ok(dom.innerHTML.includes('page-heading'),`${v}: page missing`);
  }
  assert.ok(dom.innerHTML.includes('remaining / 50'));
  console.log('13 dashboard page render smoke checks passed');
 }catch(e){console.error(e);process.exitCode=1;}
},25);
