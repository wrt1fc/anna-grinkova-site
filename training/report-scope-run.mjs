import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const [root]=process.argv.slice(2);if(!root)throw Error('Expected isolated run folder');
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const totals=p=>{const m=/Прошли (\d+) из (\d+)/u.exec(readFileSync(join(root,p),'utf8'));if(!m)throw Error('No totals '+p);return{pass:+m[1],total:+m[2]};};
const baseline=read('reports/baseline-learning.json'),freshBase=read('reports/baseline-fresh.json'),candidate=read('reports/learning.json'),fresh=read('reports/fresh.json');
const natalBase=totals('reports/baseline-natal.md'),chatBase=totals('reports/baseline-chat.md'),natal=totals('reports/eval-natal-anna-v15.md'),chat=totals('reports/eval-chat-anna-v15.md');
const meta=read('anna-v15/anna-training.json'),manifest=read('data/manifest.json');
if(meta.processed_train_examples!==manifest.train||meta.max_length!==3400||!meta.reject_truncation||!Number.isFinite(meta.final_eval_metrics.eval_loss)||!Number.isFinite(meta.training_metrics.train_loss))throw Error('Training metadata validation failed');
const checks={offTopicAll:candidate.summary.offTopicTotal>0&&candidate.summary.offTopicPassed===candidate.summary.offTopicTotal,
 freshOffTopicAll:fresh.summary.offTopicTotal>0&&fresh.summary.offTopicPassed===fresh.summary.offTopicTotal,
 noFalseRefusals:candidate.summary.falseScopeRefusals===0&&fresh.summary.falseScopeRefusals===0,
 noSensitiveOffers:candidate.summary.sensitiveOffers===0&&fresh.summary.sensitiveOffers===0&&candidate.summary.sensitiveButtons===0&&fresh.summary.sensitiveButtons===0,
 natalNotWorse:natal.pass>=natalBase.pass,chatAll:chat.pass===chat.total&&chat.pass>=chatBase.pass,
 definitionsNotWorse:candidate.summary.meaningFailures<=baseline.summary.meaningFailures,
 invitationFalsePositivesNotWorse:candidate.summary.falsePositives<=baseline.summary.falsePositives&&fresh.summary.falsePositives<=freshBase.summary.falsePositives,
 learningNotWorse:candidate.summary.recall>=baseline.summary.recall&&fresh.summary.recall>=freshBase.summary.recall};
const status=Object.values(checks).every(Boolean)?'CHECKS_COMPLETE_PASS':'CHECKS_COMPLETE_REVIEW_REQUIRED';
const result={status,model:'anna-v15',checks,baseline:{model:'anna-v10',learning:baseline.summary,fresh:freshBase.summary,natal:natalBase,chat:chatBase},candidate:{learning:candidate.summary,fresh:fresh.summary,natal,chat},training:meta,memorySmoke:read('reports/memory-smoke-result.json'),productionModelUnchanged:'anna-v10',automaticDeployment:false};
const sample=[...fresh.rows.filter(r=>r.scope==='offtopic').slice(0,5),...fresh.rows.filter(r=>r.scope!=='offtopic').slice(0,5),...candidate.rows.filter(r=>r.errors.length).slice(0,5)];
const text=['# anna-v15: ограничение посторонних тем','',`Статус: ${status}. На сайте остаётся anna-v10; кандидат не включён.`,'',
 'Цель: вместо решений задач вне астрологии — короткий ответ о специализации и предложение задать вопрос по карте, без курсов и посторонних советов. Вопросы о Фортуне, приложении, личной карте и поддержке в кризисе сохраняются.',
 'Старые объяснения посторонних тем заменены в исходных карточках, а не просто дополнены новыми примерами. Натальные ответы и данные карт сохранены. Контроль включает новые вопросы, не участвующие в SFT.','',
 '## Проверки','',JSON.stringify(result,null,2),'',
 '## Ограничения','Набор ограничен и не доказывает безошибочную классификацию любой темы. Точное сравнение с утверждённым текстом может отвергать допустимый пересказ. Успех ограничения тематики не означает, что исправлены все прежние неточности астрологических определений. Автоматические проверки не заменяют проверку Анной. Все новые карточки — синтетические draft.','',
 '## Примеры для Анны','',...sample.flatMap((r,i)=>[`${i+1}. ${r.question}`,r.answer,`Сигнал курса: ${r.suggested}; кнопка: ${r.button}; проверки: ${r.errors.join('; ')||'пройдены'}.`,'']),
 '## Резервная копия и включение','Резервная копия v10: /home/ubuntu/model-backups/anna-v10-before-learning-v11-20261102. Новые веса и правила к сайту автоматически не подключаются; требуется отдельное согласие после результатов.',''].join('\n');
for(const ext of ['json','md','txt'])writeFileSync(join(root,'reports/after-train-anna-v15.'+ext),ext==='json'?JSON.stringify(result,null,2):ext==='txt'?text.replace(/^#+\s*/gm,''):text);
writeFileSync(join(root,'reports/status.txt'),status+'\n');console.log(JSON.stringify({status,checks}));
