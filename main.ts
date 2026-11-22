require('v8').setFlagsFromString('--no-incremental-marking --single-threaded-gc');
require('./solve.js').main();

