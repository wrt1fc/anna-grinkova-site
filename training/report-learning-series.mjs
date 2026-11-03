// Called only after completed inference checks. No production changes or GPU work.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const [root,model,final='no']=process.argv.slice(2);
if(!root||!model)throw Error('Expected series root and candidate model');
const read=(p)=>JSON.parse(readFileSync(p,'utf8'));
const total=p=>{const m=/Прошли (\d+) из (\d+)/u.exec(readFileSync(p,'utf8'));if(!m)throw Error('Invalid totals '+p);return{pass:+m[1],total:+m[2]};};
const attempt=join(root,'attempt-'+model.replace('anna-',''));
const b=read(join(root,'reports/baseline-learning.json')).summary, freshBase=read(join(root,'reports/baseline-fresh.json')).summary;
const baseNatal=total(join(root,'reports/baseline-natal.md')),baseChat=total(join(root,'reports/baseline-chat.md'));
const learning=read(join(attempt,'reports/learning.json')),fresh=read(join(attempt,'reports/fresh.json'));
const natal=total(join(attempt,`reports/eval-natal-${model}.md`)),chat=total(join(attempt,`reports/eval-chat-${model}.md`));
const train=read(join(attempt,model+'/anna-training.json'));
if(!existsSync(join(attempt,model+'-q8_0.gguf'))||train.processed_train_examples!==327||!Number.isFinite(train.final_eval_metrics?.eval_loss)||!Number.isFinite(train.training_metrics?.train_loss))throw Error('Invalid weights/training metadata');
const checks={learningAll:learning.summary.errors===0,learningRecall:learning.summary.recall===1,learningPrecision:learning.summary.precision===1,
 freshAll:fresh.summary.errors===0,freshRecall:fresh.summary.recall===1,freshPrecision:fresh.summary.precision===1,
 noSensitiveSignals:learning.summary.sensitiveOffers===0&&fresh.summary.sensitiveOffers===0,noSensitiveButtons:learning.summary.sensitiveButtons===0&&fresh.summary.sensitiveButtons===0,
 factsChecks:learning.summary.meaningFailures===0&&fresh.summary.meaningFailures===0,
 natalNotWorse:natal.pass>=Math.max(32,baseNatal.pass),chatAll:chat.pass===chat.total&&chat.pass>=baseChat.pass,
 tokenLimit:train.max_length===3400&&train.reject_truncation===true,metadata:true};
const pass=Object.values(checks).every(Boolean);
const row={model,status:pass?'CHECKS_COMPLETE_PASS':'CHECKS_COMPLETE_REVIEW_REQUIRED',checks,learning:learning.summary,fresh:fresh.summary,natal,chat,training:train,
 score:learning.summary.passed+fresh.summary.passed+natal.pass+chat.pass-10*(learning.summary.sensitiveOffers+fresh.summary.sensitiveOffers)};
const summaryPath=join(root,'reports/series-summary.json');
const summary=existsSync(summaryPath)?read(summaryPath):{baseline:{model:'anna-v10',learning:b,fresh:freshBase,natal:baseNatal,chat:baseChat},attempts:[],maxAttempts:3,productionModel:'anna-v10',automaticDeployment:false};
if(existsSync(join(root,'reports/memory-smoke-result.json')))summary.memorySmoke=read(join(root,'reports/memory-smoke-result.json'));
if(summary.attempts.some(a=>a.model===model))throw Error('Attempt already reported; refusing duplicate');
summary.attempts.push(row);summary.best=[...summary.attempts].sort((a,b)=>Number(b.status==='CHECKS_COMPLETE_PASS')-Number(a.status==='CHECKS_COMPLETE_PASS')||b.score-a.score)[0].model;
summary.status=pass?'CHECKS_COMPLETE_PASS':final==='yes'?'ATTEMPT_LIMIT_REVIEW_REQUIRED':'RUNNING next-attempt';
summary.updatedAt=new Date().toISOString();
const samples=[...learning.rows.filter(r=>r.expected).slice(0,10),...learning.rows.filter(r=>!r.expected).sort((a,b)=>Number(b.errors.length>0)-Number(a.errors.length>0)).slice(0,5)];
const text=['# Повторное обучение Фортуны: anna-v12–v14','',`Статус: ${summary.status}. Лучшая из проверенных попыток: ${summary.best}. На сайте остаётся anna-v10.`,
 'Веса v10 и их проверенная резервная копия не изменяются. Включение новой версии требует отдельного согласия.','',
 '## Что изменено','Для изолированного кандидата используются краткие служебные инструкции и при обучении, и при проверке чата. Поля вопросов, данные карт и ответы сохранены. Полный пример ограничен 3400 токенами, переполнение блокируется до загрузки весов; перед обучением выполняется 10-шаговая GPU-проверка на двух самых длинных примерах. Явные положительное и отрицательное решения, 80 прежних натальных примеров и больше отрицательных примеров. 327 train, 41 validation, 20 дополнительных проверок. Все новые ответы — синтетические черновики, не одобрены Анной.',
 'Ранее известные 41 вопрос служат диагностикой/валидацией. Дополнительные 20 вопросов не входят в SFT-обучение или выбор лучшей эпохи. Повторное использование контроля при выборе параметров ограничивает обобщаемость результата: это не доказательство безошибочности.',
 'Порог: без ошибок на известных учебных и дополнительных вопросах, без лишних сигналов в чувствительных темах, натальные проверки не хуже v10 и минимум 32/34, весь общий чат. Не более трёх попыток; каждая начинается от v10, не от ухудшившейся v11. При технической ошибке конвейер останавливается и возвращает Ollama.','',
 '## Сравнение','',JSON.stringify(summary,null,2),'',
 'Проверки смысла охватывают отдельные определения и известные ошибочные формулировки. Они не заменяют профессиональную проверку всех ответов. Даже 100% на этом наборе не означает идеальную модель.','',
 '## 15 ответов последней попытки для Анны','',...samples.flatMap((r,i)=>[`${i+1}. ${r.question}`,r.answer,`Сигнал модели: ${r.suggested}; кнопка после защиты: ${r.button}; ошибки: ${r.errors.join(', ')||'не обнаружены проверками'}.`,'']),
 '## Откат','Рабочая v10 не заменялась. Резервная копия: /home/ubuntu/model-backups/anna-v10-before-learning-v11-20261102. Автоматическое подключение кандидата запрещено.',''].join('\n');
writeFileSync(summaryPath,JSON.stringify(summary,null,2));
for(const ext of ['md','txt','json'])writeFileSync(join(root,'reports/after-train-anna-learning-series.'+ext),ext==='json'?JSON.stringify(summary,null,2):ext==='txt'?text.replace(/^#+\s*/gm,''):text);
writeFileSync(join(attempt,'reports/decision.json'),JSON.stringify(row,null,2));
console.log(JSON.stringify({model,status:row.status,series:summary.status,checks}));
