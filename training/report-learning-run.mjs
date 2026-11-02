// Final report for an isolated candidate; never changes the production model.
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
const [root]=process.argv.slice(2);if(!root)throw Error('Expected candidate run folder');
const read=p=>readFileSync(join(root,p),'utf8');
const base=JSON.parse(read('reports/learning-anna-v10.json')),candidate=JSON.parse(read('reports/learning-anna-v11.json'));
const counts=file=>{const m=/Прошли (\d+) из (\d+)/u.exec(read(file));if(!m)throw Error('Missing evaluation totals '+file);return{pass:Number(m[1]),total:Number(m[2])};};
const natalBase=counts('reports/natal-base.md'),natalCandidate=counts('reports/eval-natal-anna-v11.md'),chatBase=counts('reports/chat-base.md'),chatCandidate=counts('reports/eval-chat-anna-v11.md');
const training=JSON.parse(read('anna-v11/anna-training.json'));
if(!statSync(join(root,'anna-v11/adapter_model.safetensors')).size||!statSync(join(root,'anna-v11-q8_0.gguf')).size)throw Error('Missing candidate weights');
if(!Number.isFinite(training.final_eval_metrics?.eval_loss)||!Number.isFinite(training.training_metrics?.train_loss))throw Error('Training loss missing or non-finite');
if(training.processed_train_examples!==137)throw Error('Training examples were silently discarded');
const s=candidate.summary,b=base.summary;
const checks={learningRecall:s.recall>=.9,learningPrecision:s.precision>=.95,noSensitiveOffers:s.sensitiveOffers===0,
 learningNotWorse:s.recall>=b.recall&&s.precision>=b.precision,natalNotWorse:natalCandidate.pass>=natalBase.pass,chatAllPassed:chatCandidate.pass===chatCandidate.total&&chatCandidate.pass>=chatBase.pass,lossFinite:true,allExamplesRetained:true};
const recommended=Object.values(checks).every(Boolean),status=recommended?'CHECKS_COMPLETE_PASS':'CHECKS_COMPLETE_REVIEW_REQUIRED';
const result={status,checks,baseline:b,candidate:s,natalBase,natalCandidate,chatBase,chatCandidate,training,productionModelUnchanged:'anna-v10',backup:'/home/ubuntu/model-backups/anna-v10-before-learning-v11-20261102'};
// Keep failures visible in the human review, rather than selecting only good answers.
const sample=candidate.rows.filter(r=>r.expected).slice(0,10).concat(candidate.rows.filter(r=>!r.expected).sort((a,b)=>Number(b.errors.length>0)-Number(a.errors.length>0)).slice(0,5));
const report=['# anna-v11: учебные вопросы и приглашение к обучению','',`Статус: ${status}. Рабочая модель сайта остаётся anna-v10; новая версия автоматически не включалась.`,'',
 'Резервная копия: '+result.backup,'Файл GGUF и адаптер скопированы физически и проверены SHA256; исходная anna-v10 не перезаписывалась.','',
 '## Проверки','',JSON.stringify({checks,baseline:b,candidate:s,natalBase,natalCandidate,chatBase,chatCandidate},null,2),'',
 '## Обучение','',JSON.stringify(training,null,2),'',
 '137 учебных примеров (72 с приглашением и 65 без), 41 контрольный пример. В обучении 40 прежних натальных ответов для сохранения навыка; Таро не добавлялось. Контрольные семейства понятий не попадали в обучение. Все новые ответы — синтетические черновики; Анна их пока не одобряла. Автоматические проверки не заменяют оценку точности и тона специалистом.','',
 '## Откат','', 'Если anna-v11 будет отдельно одобрена и включена, вернуть CHAT_LOCAL_MODEL=anna-v10 и CHAT_LEARNING_SIGNALS=0 в /etc/anna/site.env и перезапустить anna-site. Секреты не печатать. Если запись anna-v10 в Ollama потеряна, восстановить её из Modelfile.rollback в папке резервной копии.','',
 '## Ответы для Анны','',...sample.flatMap((r,i)=>[`${i+1}. ${r.question}`,r.answer,`Приглашение: ${r.suggested?'да':'нет'}.`,''])].join('\n');
writeFileSync(join(root,'reports/after-train-anna-v11.json'),JSON.stringify(result,null,2));writeFileSync(join(root,'reports/after-train-anna-v11.md'),report);writeFileSync(join(root,'reports/after-train-anna-v11.txt'),report.replace(/^#+\s/gm,''));writeFileSync(join(root,'reports/status.txt'),status+' '+new Date().toISOString()+'\n');console.log(JSON.stringify(result));
