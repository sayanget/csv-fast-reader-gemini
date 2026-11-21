require('v8').setFlagsFromString('--no-incremental-marking --single-threaded-gc --no-turbofan --no-use-osr --no-lazy-feedback-allocation --invocation-count-for-maglev=3000');
require('./solve.js').main();
