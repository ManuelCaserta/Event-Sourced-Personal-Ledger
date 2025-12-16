warning: in the working copy of 'src/application/ledger/__tests__/transfer.test.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/application/ledger/createAccount.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/application/ledger/recordExpense.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/application/ledger/recordIncome.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/application/ledger/transfer.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/infra/http/__tests__/auth.test.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/infra/http/middleware/errorHandler.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/infra/http/routes/auth.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/infra/http/routes/ledger.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/infra/web/public/index.html', LF will be replaced by CRLF the next time Git touches it
 src/application/auth/login.ts                      |   5 [32m+[m[31m-[m
 src/application/auth/register.ts                   |   3 [32m+[m[31m-[m
 .../ledger/__tests__/recordIncome.test.ts          |   3 [32m+[m[31m-[m
 src/application/ledger/__tests__/transfer.test.ts  |   5 [32m+[m[31m-[m
 src/application/ledger/createAccount.ts            |   3 [32m+[m[31m-[m
 src/application/ledger/recordExpense.ts            |   5 [32m+[m[31m-[m
 src/application/ledger/recordIncome.ts             |   5 [32m+[m[31m-[m
 src/application/ledger/transfer.ts                 |  41 [32m+++[m[31m---[m
 src/infra/db/__tests__/eventStoreRepo.test.ts      |  58 [32m+++++++++[m
 src/infra/http/__tests__/auth.test.ts              |  32 [32m+++[m[31m--[m
 src/infra/http/middleware/auth.ts                  |  13 [32m+[m[31m-[m
 src/infra/http/middleware/errorHandler.ts          |  87 [32m+++++++++++[m[31m--[m
 src/infra/http/middleware/rateLimit.ts             |  10 [32m+[m[31m-[m
 src/infra/http/middleware/validate.ts              |  19 [32m+[m[31m--[m
 src/infra/http/routes/auth.ts                      |  63 [32m++++++++++[m
 src/infra/http/routes/ledger.ts                    | 140 [32m++++++++++++++++++++[m[31m-[m
 src/infra/http/swagger.ts                          |  11 [32m++[m
 src/infra/web/public/index.html                    |  10 [32m+[m[31m-[m
 18 files changed, 440 insertions(+), 73 deletions(-)
