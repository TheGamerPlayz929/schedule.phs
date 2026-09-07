const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'main.js'),'utf8');
const urls=source.slice(source.indexOf('function _lunchWeatherFetchUrls()'),source.indexOf('async function _fetchLunchWeatherApi()'));

test('student widget uses local weather without enabling network weather in ordinary static previews',()=>{
  const resolve=(widget,local)=>Array.from(vm.runInNewContext(urls+'\n_lunchWeatherFetchUrls()',{
    window:{PhsStudentWidget:widget},_isLocalhost:()=>local,
    location:{origin:'http://127.0.0.1:3000',protocol:'http:'},_BACKEND_URL:'https://backend.example'
  }));
  assert.deepEqual(resolve(false,true),[]);
  assert.deepEqual(resolve(true,true),['http://127.0.0.1:3000/weather/lunch']);
  assert.deepEqual(resolve(true,false),['https://backend.example/weather/lunch']);
  assert.deepEqual(resolve(false,false),['https://backend.example/weather/lunch']);
});

test('student embed ships mirrored assets and shares the student renderer',()=>{
  for(const file of ['student-widget.html','student-widget.js','student-widget.css']){
    assert.equal(fs.readFileSync(path.join(root,file),'utf8'),fs.readFileSync(path.join(root,'public',file),'utf8'));
  }
  const html=fs.readFileSync(path.join(root,'student-widget.html'),'utf8');
  assert.match(html,/src="main\.js(?:\?[^\"]+)?"/);
  assert.match(html,/href="main\.css(?:\?[^\"]+)?"/);
  assert.match(html,/id="lunch-weather"/);
  assert.match(html,/id="ring-fill"/);
  assert.doesNotMatch(html,/privacy-analytics|gradeviewer|<iframe/);
});
