const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const shell={innerHTML:''};
const fixture={
 '/me':{username:'Tester'},'/me/planets':{planets:[{id:4,name:'Alpha',resources:{ore:1000,crystal:200},mines:{'Ore Mine':{level:9,productionPerHour:100,nextUpgrade:{productionPerHour:120,cost:{ore:150,crystal:20},buildTimeSeconds:1800}}}}]},
 '/reference/buildings':{buildings:[]}
};
const endpoints=Object.keys(fixture);
const ctx=vm.createContext({document:{querySelector:()=>shell,addEventListener:()=>{}},fetch:async url=>({ok:true,json:async()=>url==='/api/status'?{configured:true,usage:{remaining:42,limit:50,used:8},cache:{},endpoints}:url==='/api/snapshot'?{endpoints:Object.fromEntries(endpoints.map(p=>[p,{data:fixture[p],updatedAt:1000000000}]))}:{snapshots:[]}}),location:{host:'local.test'},window:{scrollTo:()=>{}},navigator:{},Intl,Date,Math,Number,JSON,String,Object,Array,Map,Set,RegExp,URL,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem:()=>{}},console});
vm.runInContext(fs.readFileSync('web/mines.js','utf8'),ctx,{filename:'web/mines.js'});
vm.runInContext(fs.readFileSync('web/app.js','utf8'),ctx,{filename:'web/app.js'});
setTimeout(()=>{
 try{
  vm.runInContext("state.view='mines';render()",ctx);
  assert.match(shell.innerHTML,/Mine upgrade planner/);
  assert.match(shell.innerHTML,/Ore Mine/);
  assert.match(shell.innerHTML,/Recommended next upgrades/);
  assert.match(shell.innerHTML,/9\.0h/); // 0.5 construction + (150 + 20)/20 production hours
  console.log('Mine planner dashboard smoke check passed');
 }catch(e){console.error(e);process.exitCode=1;}
},35);