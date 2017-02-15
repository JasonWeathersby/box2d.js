// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = eval('(function() { try { return Module || {} } catch(e) { return {} } })()');

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');
    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() { throw 'no read() available' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  eval("if (typeof gc === 'function' && gc.toString().indexOf('[native code]') > 0) var gc = undefined"); // wipe out the SpiderMonkey shell 'gc' function, which can confuse closure (uses it as a minified name, and it is then initted to a non-falsey value unexpectedly)
}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      // optimize away arguments usage in common cases
      if (sig.length === 1) {
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func);
        };
      } else if (sig.length === 2) {
        sigCache[func] = function dynCall_wrapper(arg) {
          return Runtime.dynCall(sig, func, [arg]);
        };
      } else {
        // general case
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func, Array.prototype.slice.call(arguments));
        };
      }
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + size)|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { var ret = HEAP32[DYNAMICTOP_PTR>>2];var end = (((ret + size + 15)|0) & -16);HEAP32[DYNAMICTOP_PTR>>2] = end;if (end >= TOTAL_MEMORY) {var success = enlargeMemory();if (!success) {HEAP32[DYNAMICTOP_PTR>>2] = ret;return 0;}}return ret;},
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 1024,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;
Runtime['addFunction'] = Runtime.addFunction;
Runtime['removeFunction'] = Runtime.removeFunction;



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = Runtime.stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface.
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }

  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;


function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if (!runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var __cxa_demangle_func = Module['___cxa_demangle'] || Module['__cxa_demangle'];
  if (__cxa_demangle_func) {
    try {
      var s =
        func.substr(1);
      var len = lengthBytesUTF8(s)+1;
      var buf = _malloc(len);
      stringToUTF8(s, buf, len);
      var status = _malloc(4);
      var ret = __cxa_demangle_func(buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed
    } catch(e) {
      // ignore problems here
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
    // failure when using libcxxabi, don't demangle
    return func;
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 4096;

function alignMemoryPage(x) {
  if (x % 4096 > 0) {
    x += (4096 - (x % 4096));
  }
  return x;
}

var HEAP;
var buffer;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;



function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;

var WASM_PAGE_SIZE = 64 * 1024;

var totalMemory = WASM_PAGE_SIZE;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2*TOTAL_STACK) {
  if (totalMemory < 16*1024*1024) {
    totalMemory *= 2;
  } else {
    totalMemory += 16*1024*1024;
  }
}
if (totalMemory !== TOTAL_MEMORY) {
  TOTAL_MEMORY = totalMemory;
}

// Initialize the runtime's memory



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
} else {
  // Use a WebAssembly memory where available
  if (typeof WebAssembly === 'object' && typeof WebAssembly.Memory === 'function') {
    Module['wasmMemory'] = new WebAssembly.Memory({ initial: TOTAL_MEMORY / WASM_PAGE_SIZE, maximum: TOTAL_MEMORY / WASM_PAGE_SIZE });
    buffer = Module['wasmMemory'].buffer;
  } else
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Runtime.dynCall('v', func);
      } else {
        Runtime.dynCall('vi', func, [callback.arg]);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools


function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
function writeStringToMemory(string, buffer, dontAddNull) {
  Runtime.warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var lastChar, end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  HEAP8.set(array, buffer);
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];

if (!Math['fround']) {
  var froundBuffer = new Float32Array(1);
  Math['fround'] = function(x) { froundBuffer[0] = x; return froundBuffer[0] };
}
Math.fround = Math['fround'];

if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

if (!Math['trunc']) Math['trunc'] = function(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
};
Math.trunc = Math['trunc'];

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled

function getUniqueRunDependency(id) {
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;





function integrateWasmJS(Module) {
  // wasm.js has several methods for creating the compiled code module here:
  //  * 'native-wasm' : use native WebAssembly support in the browser
  //  * 'interpret-s-expr': load s-expression code from a .wast and interpret
  //  * 'interpret-binary': load binary wasm and interpret
  //  * 'interpret-asm2wasm': load asm.js code, translate to wasm, and interpret
  //  * 'asmjs': no wasm, just load the asm.js code and use that (good for testing)
  // The method can be set at compile time (BINARYEN_METHOD), or runtime by setting Module['wasmJSMethod'].
  // The method can be a comma-separated list, in which case, we will try the
  // options one by one. Some of them can fail gracefully, and then we can try
  // the next.

  // inputs

  var method = Module['wasmJSMethod'] || 'native-wasm';
  Module['wasmJSMethod'] = method;

  var wasmTextFile = Module['wasmTextFile'] || 'Box2D_v2.3.1b_min.wast';
  var wasmBinaryFile = Module['wasmBinaryFile'] || 'Box2D_v2.3.1b_min.wasm';
  var asmjsCodeFile = Module['asmjsCodeFile'] || 'Box2D_v2.3.1b_min.asm.js';

  // utilities

  var wasmPageSize = 64*1024;

  var asm2wasmImports = { // special asm2wasm imports
    "f64-rem": function(x, y) {
      return x % y;
    },
    "f64-to-int": function(x) {
      return x | 0;
    },
    "i32s-div": function(x, y) {
      return ((x | 0) / (y | 0)) | 0;
    },
    "i32u-div": function(x, y) {
      return ((x >>> 0) / (y >>> 0)) >>> 0;
    },
    "i32s-rem": function(x, y) {
      return ((x | 0) % (y | 0)) | 0;
    },
    "i32u-rem": function(x, y) {
      return ((x >>> 0) % (y >>> 0)) >>> 0;
    },
    "debugger": function() {
      debugger;
    },
  };

  var info = {
    'global': null,
    'env': null,
    'asm2wasm': asm2wasmImports,
    'parent': Module // Module inside wasm-js.cpp refers to wasm-js.cpp; this allows access to the outside program.
  };

  var exports = null;

  function lookupImport(mod, base) {
    var lookup = info;
    if (mod.indexOf('.') < 0) {
      lookup = (lookup || {})[mod];
    } else {
      var parts = mod.split('.');
      lookup = (lookup || {})[parts[0]];
      lookup = (lookup || {})[parts[1]];
    }
    if (base) {
      lookup = (lookup || {})[base];
    }
    if (lookup === undefined) {
      abort('bad lookupImport to (' + mod + ').' + base);
    }
    return lookup;
  }

  function mergeMemory(newBuffer) {
    // The wasm instance creates its memory. But static init code might have written to
    // buffer already, including the mem init file, and we must copy it over in a proper merge.
    // TODO: avoid this copy, by avoiding such static init writes
    // TODO: in shorter term, just copy up to the last static init write
    var oldBuffer = Module['buffer'];
    if (newBuffer.byteLength < oldBuffer.byteLength) {
      Module['printErr']('the new buffer in mergeMemory is smaller than the previous one. in native wasm, we should grow memory here');
    }
    var oldView = new Int8Array(oldBuffer);
    var newView = new Int8Array(newBuffer);

    // If we have a mem init file, do not trample it
    if (!memoryInitializer) {
      oldView.set(newView.subarray(Module['STATIC_BASE'], Module['STATIC_BASE'] + Module['STATIC_BUMP']), Module['STATIC_BASE']);
    }

    newView.set(oldView);
    updateGlobalBuffer(newBuffer);
    updateGlobalBufferViews();
  }

  var WasmTypes = {
    none: 0,
    i32: 1,
    i64: 2,
    f32: 3,
    f64: 4
  };

  function fixImports(imports) {
    if (!0) return imports;
    var ret = {};
    for (var i in imports) {
      var fixed = i;
      if (fixed[0] == '_') fixed = fixed.substr(1);
      ret[fixed] = imports[i];
    }
    return ret;
  }

  function getBinary() {
    var binary;
    if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      binary = Module['wasmBinary'];
      assert(binary, "on the web, we need the wasm binary to be preloaded and set on Module['wasmBinary']. emcc.py will do that for you when generating HTML (but not JS)");
      binary = new Uint8Array(binary);
    } else {
      binary = Module['readBinary'](wasmBinaryFile);
    }
    return binary;
  }

  // do-method functions

  function doJustAsm(global, env, providedBuffer) {
    // if no Module.asm, or it's the method handler helper (see below), then apply
    // the asmjs
    if (typeof Module['asm'] !== 'function' || Module['asm'] === methodHandler) {
      if (!Module['asmPreload']) {
        // you can load the .asm.js file before this, to avoid this sync xhr and eval
        eval(Module['read'](asmjsCodeFile)); // set Module.asm
      } else {
        Module['asm'] = Module['asmPreload'];
      }
    }
    if (typeof Module['asm'] !== 'function') {
      Module['printErr']('asm evalling did not set the module properly');
      return false;
    }
    return Module['asm'](global, env, providedBuffer);
  }

  function doNativeWasm(global, env, providedBuffer) {
    if (typeof WebAssembly !== 'object') {
      Module['printErr']('no native wasm support detected');
      return false;
    }
    // prepare memory import
    if (!(Module['wasmMemory'] instanceof WebAssembly.Memory)) {
      Module['printErr']('no native wasm Memory in use');
      return false;
    }
    env['memory'] = Module['wasmMemory'];
    // Load the wasm module and create an instance of using native support in the JS engine.
    info['global'] = {
      'NaN': NaN,
      'Infinity': Infinity
    };
    info['global.Math'] = global.Math;
    info['env'] = env;
    var instance;
    try {
      instance = new WebAssembly.Instance(new WebAssembly.Module(getBinary()), info)
    } catch (e) {
      Module['printErr']('failed to compile wasm module: ' + e);
      if (e.toString().indexOf('imported Memory with incompatible size') >= 0) {
        Module['printErr']('Memory size incompatibility issues may be due to changing TOTAL_MEMORY at runtime to something too large. Use ALLOW_MEMORY_GROWTH to allow any size memory (and also make sure not to set TOTAL_MEMORY at runtime to something smaller than it was at compile time).');
      }
      return false;
    }
    exports = instance.exports;
    if (exports.memory) mergeMemory(exports.memory);

    Module["usingWasm"] = true;

    return exports;
  }

  function doWasmPolyfill(global, env, providedBuffer, method) {
    if (typeof WasmJS !== 'function') {
      Module['printErr']('WasmJS not detected - polyfill not bundled?');
      return false;
    }

    // Use wasm.js to polyfill and execute code in a wasm interpreter.
    var wasmJS = WasmJS({});

    // XXX don't be confused. Module here is in the outside program. wasmJS is the inner wasm-js.cpp.
    wasmJS['outside'] = Module; // Inside wasm-js.cpp, Module['outside'] reaches the outside module.

    // Information for the instance of the module.
    wasmJS['info'] = info;

    wasmJS['lookupImport'] = lookupImport;

    assert(providedBuffer === Module['buffer']); // we should not even need to pass it as a 3rd arg for wasm, but that's the asm.js way.

    info.global = global;
    info.env = env;

    // polyfill interpreter expects an ArrayBuffer
    assert(providedBuffer === Module['buffer']);
    env['memory'] = providedBuffer;
    assert(env['memory'] instanceof ArrayBuffer);

    wasmJS['providedTotalMemory'] = Module['buffer'].byteLength;

    // Prepare to generate wasm, using either asm2wasm or s-exprs
    var code;
    if (method === 'interpret-binary') {
      code = getBinary();
    } else {
      code = Module['read'](method == 'interpret-asm2wasm' ? asmjsCodeFile : wasmTextFile);
    }
    var temp;
    if (method == 'interpret-asm2wasm') {
      temp = wasmJS['_malloc'](code.length + 1);
      wasmJS['writeAsciiToMemory'](code, temp);
      wasmJS['_load_asm2wasm'](temp);
    } else if (method === 'interpret-s-expr') {
      temp = wasmJS['_malloc'](code.length + 1);
      wasmJS['writeAsciiToMemory'](code, temp);
      wasmJS['_load_s_expr2wasm'](temp);
    } else if (method === 'interpret-binary') {
      temp = wasmJS['_malloc'](code.length);
      wasmJS['HEAPU8'].set(code, temp);
      wasmJS['_load_binary2wasm'](temp, code.length);
    } else {
      throw 'what? ' + method;
    }
    wasmJS['_free'](temp);

    wasmJS['_instantiate'](temp);

    if (Module['newBuffer']) {
      mergeMemory(Module['newBuffer']);
      Module['newBuffer'] = null;
    }

    exports = wasmJS['asmExports'];

    return exports;
  }

  // We may have a preloaded value in Module.asm, save it
  Module['asmPreload'] = Module['asm'];

  // Memory growth integration code
  Module['reallocBuffer'] = function(size) {
    size = Math.ceil(size / wasmPageSize) * wasmPageSize; // round up to wasm page size
    var old = Module['buffer'];
    var result = exports['__growWasmMemory'](size / wasmPageSize); // tiny wasm method that just does grow_memory
    if (Module["usingWasm"]) {
      if (result !== (-1 | 0)) {
        // success in native wasm memory growth, get the buffer from the memory
        return Module['buffer'] = Module['wasmMemory'].buffer;
      } else {
        return null;
      }
    } else {
      // in interpreter, we replace Module.buffer if we allocate
      return Module['buffer'] !== old ? Module['buffer'] : null; // if it was reallocated, it changed
    }
  };

  // Provide an "asm.js function" for the application, called to "link" the asm.js module. We instantiate
  // the wasm module at that time, and it receives imports and provides exports and so forth, the app
  // doesn't need to care that it is wasm or olyfilled wasm or asm.js.

  Module['asm'] = function(global, env, providedBuffer) {
    global = fixImports(global);
    env = fixImports(env);

    // import table
    if (!env['table']) {
      var TABLE_SIZE = Module['wasmTableSize'];
      if (TABLE_SIZE === undefined) TABLE_SIZE = 1024; // works in binaryen interpreter at least
      var MAX_TABLE_SIZE = Module['wasmMaxTableSize'];
      if (typeof WebAssembly === 'object' && typeof WebAssembly.Table === 'function') {
        if (MAX_TABLE_SIZE !== undefined) {
          env['table'] = new WebAssembly.Table({ initial: TABLE_SIZE, maximum: MAX_TABLE_SIZE, element: 'anyfunc' });
        } else {
          env['table'] = new WebAssembly.Table({ initial: TABLE_SIZE, element: 'anyfunc' });
        }
      } else {
        env['table'] = new Array(TABLE_SIZE); // works in binaryen interpreter at least
      }
      Module['wasmTable'] = env['table'];
    }

    if (!env['memoryBase']) {
      env['memoryBase'] = Module['STATIC_BASE']; // tell the memory segments where to place themselves
    }
    if (!env['tableBase']) {
      env['tableBase'] = 0; // table starts at 0 by default, in dynamic linking this will change
    }

    // try the methods. each should return the exports if it succeeded

    var exports;
    var methods = method.split(',');

    for (var i = 0; i < methods.length; i++) {
      var curr = methods[i];

      Module['printErr']('trying binaryen method: ' + curr);

      if (curr === 'native-wasm') {
        if (exports = doNativeWasm(global, env, providedBuffer)) break;
      } else if (curr === 'asmjs') {
        if (exports = doJustAsm(global, env, providedBuffer)) break;
      } else if (curr === 'interpret-asm2wasm' || curr === 'interpret-s-expr' || curr === 'interpret-binary') {
        if (exports = doWasmPolyfill(global, env, providedBuffer, curr)) break;
      } else {
        throw 'bad method: ' + curr;
      }
    }

    if (!exports) throw 'no binaryen method succeeded. consider enabling more options, like interpreting, if you want that: https://github.com/kripken/emscripten/wiki/WebAssembly#binaryen-methods';

    Module['printErr']('binaryen method succeeded.');

    return exports;
  };

  var methodHandler = Module['asm']; // note our method handler, as we may modify Module['asm'] later
}

integrateWasmJS(Module);

// === Body ===

var ASM_CONSTS = [function($0, $1) { { var self = Module['getCache'](Module['JSDestructionListener'])[$0]; if (!self.hasOwnProperty('SayGoodbyeJoint')) throw 'a JSImplementation must implement all functions, you forgot JSDestructionListener::SayGoodbyeJoint.'; self['SayGoodbyeJoint']($1); } },
 function($0, $1) { { var self = Module['getCache'](Module['JSDestructionListener'])[$0]; if (!self.hasOwnProperty('SayGoodbyeFixture')) throw 'a JSImplementation must implement all functions, you forgot JSDestructionListener::SayGoodbyeFixture.'; self['SayGoodbyeFixture']($1); } },
 function($0, $1) { { var self = Module['getCache'](Module['JSQueryCallback'])[$0]; if (!self.hasOwnProperty('ReportFixture')) throw 'a JSImplementation must implement all functions, you forgot JSQueryCallback::ReportFixture.'; return self['ReportFixture']($1); } },
 function($0, $1, $2, $3, $4) { { var self = Module['getCache'](Module['JSRayCastCallback'])[$0]; if (!self.hasOwnProperty('ReportFixture')) throw 'a JSImplementation must implement all functions, you forgot JSRayCastCallback::ReportFixture.'; return self['ReportFixture']($1,$2,$3,$4); } },
 function($0, $1) { { var self = Module['getCache'](Module['JSContactListener'])[$0]; if (!self.hasOwnProperty('BeginContact')) throw 'a JSImplementation must implement all functions, you forgot JSContactListener::BeginContact.'; self['BeginContact']($1); } },
 function($0, $1) { { var self = Module['getCache'](Module['JSContactListener'])[$0]; if (!self.hasOwnProperty('EndContact')) throw 'a JSImplementation must implement all functions, you forgot JSContactListener::EndContact.'; self['EndContact']($1); } },
 function($0, $1, $2) { { var self = Module['getCache'](Module['JSContactListener'])[$0]; if (!self.hasOwnProperty('PreSolve')) throw 'a JSImplementation must implement all functions, you forgot JSContactListener::PreSolve.'; self['PreSolve']($1,$2); } },
 function($0, $1, $2) { { var self = Module['getCache'](Module['JSContactListener'])[$0]; if (!self.hasOwnProperty('PostSolve')) throw 'a JSImplementation must implement all functions, you forgot JSContactListener::PostSolve.'; self['PostSolve']($1,$2); } },
 function($0, $1, $2) { { var self = Module['getCache'](Module['JSContactFilter'])[$0]; if (!self.hasOwnProperty('ShouldCollide')) throw 'a JSImplementation must implement all functions, you forgot JSContactFilter::ShouldCollide.'; return self['ShouldCollide']($1,$2); } },
 function($0, $1, $2, $3) { { var self = Module['getCache'](Module['JSDraw'])[$0]; if (!self.hasOwnProperty('DrawPolygon')) throw 'a JSImplementation must implement all functions, you forgot JSDraw::DrawPolygon.'; self['DrawPolygon']($1,$2,$3); } },
 function($0, $1, $2, $3) { { var self = Module['getCache'](Module['JSDraw'])[$0]; if (!self.hasOwnProperty('DrawSolidPolygon')) throw 'a JSImplementation must implement all functions, you forgot JSDraw::DrawSolidPolygon.'; self['DrawSolidPolygon']($1,$2,$3); } },
 function($0, $1, $2, $3) { { var self = Module['getCache'](Module['JSDraw'])[$0]; if (!self.hasOwnProperty('DrawCircle')) throw 'a JSImplementation must implement all functions, you forgot JSDraw::DrawCircle.'; self['DrawCircle']($1,$2,$3); } },
 function($0, $1, $2, $3, $4) { { var self = Module['getCache'](Module['JSDraw'])[$0]; if (!self.hasOwnProperty('DrawSolidCircle')) throw 'a JSImplementation must implement all functions, you forgot JSDraw::DrawSolidCircle.'; self['DrawSolidCircle']($1,$2,$3,$4); } },
 function($0, $1, $2, $3) { { var self = Module['getCache'](Module['JSDraw'])[$0]; if (!self.hasOwnProperty('DrawSegment')) throw 'a JSImplementation must implement all functions, you forgot JSDraw::DrawSegment.'; self['DrawSegment']($1,$2,$3); } },
 function($0, $1) { { var self = Module['getCache'](Module['JSDraw'])[$0]; if (!self.hasOwnProperty('DrawTransform')) throw 'a JSImplementation must implement all functions, you forgot JSDraw::DrawTransform.'; self['DrawTransform']($1); } }];

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
 return ASM_CONSTS[code](a0, a1, a2);
}

function _emscripten_asm_const_iiidi(code, a0, a1, a2, a3) {
 return ASM_CONSTS[code](a0, a1, a2, a3);
}

function _emscripten_asm_const_iiidii(code, a0, a1, a2, a3, a4) {
 return ASM_CONSTS[code](a0, a1, a2, a3, a4);
}

function _emscripten_asm_const_diiiid(code, a0, a1, a2, a3, a4) {
 return ASM_CONSTS[code](a0, a1, a2, a3, a4);
}

function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
 return ASM_CONSTS[code](a0, a1, a2, a3);
}

function _emscripten_asm_const_iii(code, a0, a1) {
 return ASM_CONSTS[code](a0, a1);
}



STATIC_BASE = 1024;

STATICTOP = STATIC_BASE + 23232;
  /* global initializers */  __ATINIT__.push();
  

memoryInitializer = Module["wasmJSMethod"].indexOf("asmjs") >= 0 || Module["wasmJSMethod"].indexOf("interpret-asm2wasm") >= 0 ? "Box2D_v2.3.1b_min.js.mem" : null;




var STATIC_BUMP = 23232;
Module["STATIC_BASE"] = STATIC_BASE;
Module["STATIC_BUMP"] = STATIC_BUMP;

/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  function ___cxa_pure_virtual() {
      ABORT = true;
      throw 'Pure virtual function called!';
    }

  function ___assert_fail(condition, filename, line, func) {
      ABORT = true;
      throw 'Assertion failed: ' + Pointer_stringify(condition) + ', at: ' + [filename ? Pointer_stringify(filename) : 'unknown filename', line, func ? Pointer_stringify(func) : 'unknown function'] + ' at ' + stackTrace();
    }

   
  Module["_memset"] = _memset;

  function _abort() {
      Module['abort']();
    }

  var _emscripten_asm_const_double=true;

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Runtime.dynCall('vi', info.destructor, [ptr]);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};function ___cxa_begin_catch(ptr) {
      var info = EXCEPTIONS.infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--;
      }
      if (info) info.rethrown = false;
      EXCEPTIONS.caught.push(ptr);
      EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
      return ptr;
    }

  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      Runtime.dynCall('v', func);
      _pthread_once.seen[ptr] = 1;
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  var PTHREAD_SPECIFIC={};function _pthread_getspecific(key) {
      return PTHREAD_SPECIFIC[key] || 0;
    }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      return value;
    } 
  Module["_sbrk"] = _sbrk;

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _pthread_key_create(key, destructor) {
      if (key == 0) {
        return ERRNO_CODES.EINVAL;
      }
      HEAP32[((key)>>2)]=PTHREAD_SPECIFIC_NEXT_KEY;
      // values start at 0
      PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
      PTHREAD_SPECIFIC_NEXT_KEY++;
      return 0;
    }

  
  
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((asm["setTempRet0"](0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((asm["setTempRet0"](0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((asm["setTempRet0"](typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((asm["setTempRet0"](throwntype),thrown)|0);
    }function ___gxx_personality_v0() {
    }

  var _emscripten_asm_const_int=true;

  function _pthread_setspecific(key, value) {
      if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
      }
      PTHREAD_SPECIFIC[key] = value;
      return 0;
    }

  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
DYNAMICTOP_PTR = allocate(1, "i32", ALLOC_STATIC);

STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory



Module['wasmTableSize'] = 1152;

Module['wasmMaxTableSize'] = 1152;

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_iiii(index,a1,a2,a3) {
    return Runtime.functionPointers[index](a1,a2,a3);
}

function invoke_viifii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viifii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_viifii(index,a1,a2,a3,a4,a5) {
    Runtime.functionPointers[index](a1,a2,a3,a4,a5);
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_viiiii(index,a1,a2,a3,a4,a5) {
    Runtime.functionPointers[index](a1,a2,a3,a4,a5);
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_vi(index,a1) {
    Runtime.functionPointers[index](a1);
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_vii(index,a1,a2) {
    Runtime.functionPointers[index](a1,a2);
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_ii(index,a1) {
    return Runtime.functionPointers[index](a1);
}

function invoke_fif(index,a1,a2) {
  try {
    return Module["dynCall_fif"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_fif(index,a1,a2) {
    return Runtime.functionPointers[index](a1,a2);
}

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_viii(index,a1,a2,a3) {
    Runtime.functionPointers[index](a1,a2,a3);
}

function invoke_viifi(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viifi"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_viifi(index,a1,a2,a3,a4) {
    Runtime.functionPointers[index](a1,a2,a3,a4);
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_v(index) {
    Runtime.functionPointers[index]();
}

function invoke_viif(index,a1,a2,a3) {
  try {
    Module["dynCall_viif"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_viif(index,a1,a2,a3) {
    Runtime.functionPointers[index](a1,a2,a3);
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
    Runtime.functionPointers[index](a1,a2,a3,a4,a5,a6);
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_iii(index,a1,a2) {
    return Runtime.functionPointers[index](a1,a2);
}

function invoke_iiiiii(index,a1,a2,a3,a4,a5) {
  try {
    return Module["dynCall_iiiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_iiiiii(index,a1,a2,a3,a4,a5) {
    return Runtime.functionPointers[index](a1,a2,a3,a4,a5);
}

function invoke_fiiiif(index,a1,a2,a3,a4,a5) {
  try {
    return Module["dynCall_fiiiif"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_fiiiif(index,a1,a2,a3,a4,a5) {
    return Runtime.functionPointers[index](a1,a2,a3,a4,a5);
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function jsCall_viiii(index,a1,a2,a3,a4) {
    Runtime.functionPointers[index](a1,a2,a3,a4);
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_iiii": invoke_iiii, "jsCall_iiii": jsCall_iiii, "invoke_viifii": invoke_viifii, "jsCall_viifii": jsCall_viifii, "invoke_viiiii": invoke_viiiii, "jsCall_viiiii": jsCall_viiiii, "invoke_vi": invoke_vi, "jsCall_vi": jsCall_vi, "invoke_vii": invoke_vii, "jsCall_vii": jsCall_vii, "invoke_ii": invoke_ii, "jsCall_ii": jsCall_ii, "invoke_fif": invoke_fif, "jsCall_fif": jsCall_fif, "invoke_viii": invoke_viii, "jsCall_viii": jsCall_viii, "invoke_viifi": invoke_viifi, "jsCall_viifi": jsCall_viifi, "invoke_v": invoke_v, "jsCall_v": jsCall_v, "invoke_viif": invoke_viif, "jsCall_viif": jsCall_viif, "invoke_viiiiii": invoke_viiiiii, "jsCall_viiiiii": jsCall_viiiiii, "invoke_iii": invoke_iii, "jsCall_iii": jsCall_iii, "invoke_iiiiii": invoke_iiiiii, "jsCall_iiiiii": jsCall_iiiiii, "invoke_fiiiif": invoke_fiiiif, "jsCall_fiiiif": jsCall_fiiiif, "invoke_viiii": invoke_viiii, "jsCall_viiii": jsCall_viiii, "_emscripten_asm_const_iiiii": _emscripten_asm_const_iiiii, "_emscripten_asm_const_diiiid": _emscripten_asm_const_diiiid, "_pthread_key_create": _pthread_key_create, "_abort": _abort, "___gxx_personality_v0": ___gxx_personality_v0, "_emscripten_asm_const_iiidii": _emscripten_asm_const_iiidii, "___assert_fail": ___assert_fail, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___setErrNo": ___setErrNo, "___cxa_begin_catch": ___cxa_begin_catch, "_emscripten_memcpy_big": _emscripten_memcpy_big, "___resumeException": ___resumeException, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "_pthread_getspecific": _pthread_getspecific, "_pthread_once": _pthread_once, "___syscall54": ___syscall54, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiidi": _emscripten_asm_const_iiidi, "_pthread_setspecific": _pthread_setspecific, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "___syscall6": ___syscall6, "___syscall140": ___syscall140, "___cxa_pure_virtual": ___cxa_pure_virtual, "___syscall146": ___syscall146, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX };
// EMSCRIPTEN_START_ASM
var asm =Module["asm"]// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var _emscripten_bind_b2WheelJoint_GetSpringDampingRatio_0 = Module["_emscripten_bind_b2WheelJoint_GetSpringDampingRatio_0"] = asm["_emscripten_bind_b2WheelJoint_GetSpringDampingRatio_0"];
var _emscripten_bind_b2ContactEdge_set_next_1 = Module["_emscripten_bind_b2ContactEdge_set_next_1"] = asm["_emscripten_bind_b2ContactEdge_set_next_1"];
var _emscripten_bind_b2ChainShape_get_m_count_0 = Module["_emscripten_bind_b2ChainShape_get_m_count_0"] = asm["_emscripten_bind_b2ChainShape_get_m_count_0"];
var _emscripten_bind_b2PrismaticJointDef_get_motorSpeed_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_motorSpeed_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_motorSpeed_0"];
var _emscripten_bind_b2PulleyJoint_SetUserData_1 = Module["_emscripten_bind_b2PulleyJoint_SetUserData_1"] = asm["_emscripten_bind_b2PulleyJoint_SetUserData_1"];
var _emscripten_bind_b2Shape_ComputeAABB_3 = Module["_emscripten_bind_b2Shape_ComputeAABB_3"] = asm["_emscripten_bind_b2Shape_ComputeAABB_3"];
var _emscripten_bind_b2FrictionJointDef_set_userData_1 = Module["_emscripten_bind_b2FrictionJointDef_set_userData_1"] = asm["_emscripten_bind_b2FrictionJointDef_set_userData_1"];
var _emscripten_bind_b2MouseJoint_IsActive_0 = Module["_emscripten_bind_b2MouseJoint_IsActive_0"] = asm["_emscripten_bind_b2MouseJoint_IsActive_0"];
var _emscripten_bind_b2World_IsLocked_0 = Module["_emscripten_bind_b2World_IsLocked_0"] = asm["_emscripten_bind_b2World_IsLocked_0"];
var _emscripten_bind_b2Draw_GetFlags_0 = Module["_emscripten_bind_b2Draw_GetFlags_0"] = asm["_emscripten_bind_b2Draw_GetFlags_0"];
var _emscripten_bind_b2FrictionJoint_IsActive_0 = Module["_emscripten_bind_b2FrictionJoint_IsActive_0"] = asm["_emscripten_bind_b2FrictionJoint_IsActive_0"];
var _emscripten_bind_b2Color_set_g_1 = Module["_emscripten_bind_b2Color_set_g_1"] = asm["_emscripten_bind_b2Color_set_g_1"];
var _emscripten_bind_b2PolygonShape_RayCast_4 = Module["_emscripten_bind_b2PolygonShape_RayCast_4"] = asm["_emscripten_bind_b2PolygonShape_RayCast_4"];
var _emscripten_bind_b2World_GetTreeBalance_0 = Module["_emscripten_bind_b2World_GetTreeBalance_0"] = asm["_emscripten_bind_b2World_GetTreeBalance_0"];
var _emscripten_bind_b2ChainShape_get_m_vertices_0 = Module["_emscripten_bind_b2ChainShape_get_m_vertices_0"] = asm["_emscripten_bind_b2ChainShape_get_m_vertices_0"];
var _emscripten_bind_JSDraw_DrawSolidCircle_4 = Module["_emscripten_bind_JSDraw_DrawSolidCircle_4"] = asm["_emscripten_bind_JSDraw_DrawSolidCircle_4"];
var _emscripten_bind_b2RevoluteJoint_GetLocalAnchorA_0 = Module["_emscripten_bind_b2RevoluteJoint_GetLocalAnchorA_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetLocalAnchorA_0"];
var _emscripten_bind_b2FixtureDef_get_filter_0 = Module["_emscripten_bind_b2FixtureDef_get_filter_0"] = asm["_emscripten_bind_b2FixtureDef_get_filter_0"];
var _emscripten_bind_b2FrictionJointDef_get_type_0 = Module["_emscripten_bind_b2FrictionJointDef_get_type_0"] = asm["_emscripten_bind_b2FrictionJointDef_get_type_0"];
var _emscripten_bind_b2MotorJointDef_set_type_1 = Module["_emscripten_bind_b2MotorJointDef_set_type_1"] = asm["_emscripten_bind_b2MotorJointDef_set_type_1"];
var _emscripten_bind_b2FixtureDef_set_userData_1 = Module["_emscripten_bind_b2FixtureDef_set_userData_1"] = asm["_emscripten_bind_b2FixtureDef_set_userData_1"];
var _emscripten_bind_b2EdgeShape_set_m_hasVertex3_1 = Module["_emscripten_bind_b2EdgeShape_set_m_hasVertex3_1"] = asm["_emscripten_bind_b2EdgeShape_set_m_hasVertex3_1"];
var _emscripten_bind_b2JointEdge_set_joint_1 = Module["_emscripten_bind_b2JointEdge_set_joint_1"] = asm["_emscripten_bind_b2JointEdge_set_joint_1"];
var _emscripten_bind_b2Fixture___destroy___0 = Module["_emscripten_bind_b2Fixture___destroy___0"] = asm["_emscripten_bind_b2Fixture___destroy___0"];
var _emscripten_bind_b2World_SetWarmStarting_1 = Module["_emscripten_bind_b2World_SetWarmStarting_1"] = asm["_emscripten_bind_b2World_SetWarmStarting_1"];
var _emscripten_bind_JSDraw_DrawCircle_3 = Module["_emscripten_bind_JSDraw_DrawCircle_3"] = asm["_emscripten_bind_JSDraw_DrawCircle_3"];
var _emscripten_bind_b2WeldJoint_IsActive_0 = Module["_emscripten_bind_b2WeldJoint_IsActive_0"] = asm["_emscripten_bind_b2WeldJoint_IsActive_0"];
var _emscripten_bind_b2DestructionListener___destroy___0 = Module["_emscripten_bind_b2DestructionListener___destroy___0"] = asm["_emscripten_bind_b2DestructionListener___destroy___0"];
var _emscripten_bind_b2BodyDef_set_type_1 = Module["_emscripten_bind_b2BodyDef_set_type_1"] = asm["_emscripten_bind_b2BodyDef_set_type_1"];
var _emscripten_bind_b2ChainShape_ComputeAABB_3 = Module["_emscripten_bind_b2ChainShape_ComputeAABB_3"] = asm["_emscripten_bind_b2ChainShape_ComputeAABB_3"];
var _emscripten_bind_b2PulleyJoint_GetUserData_0 = Module["_emscripten_bind_b2PulleyJoint_GetUserData_0"] = asm["_emscripten_bind_b2PulleyJoint_GetUserData_0"];
var _emscripten_bind_b2WeldJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2WeldJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2WeldJoint_GetReactionTorque_1"];
var _emscripten_bind_b2MotorJointDef_get_maxForce_0 = Module["_emscripten_bind_b2MotorJointDef_get_maxForce_0"] = asm["_emscripten_bind_b2MotorJointDef_get_maxForce_0"];
var _emscripten_bind_b2DistanceJointDef_get_userData_0 = Module["_emscripten_bind_b2DistanceJointDef_get_userData_0"] = asm["_emscripten_bind_b2DistanceJointDef_get_userData_0"];
var _emscripten_bind_b2BodyDef_get_position_0 = Module["_emscripten_bind_b2BodyDef_get_position_0"] = asm["_emscripten_bind_b2BodyDef_get_position_0"];
var _emscripten_bind_b2RevoluteJointDef_set_userData_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_userData_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_userData_1"];
var _emscripten_bind_b2World_SetContactFilter_1 = Module["_emscripten_bind_b2World_SetContactFilter_1"] = asm["_emscripten_bind_b2World_SetContactFilter_1"];
var _emscripten_bind_b2WheelJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2WheelJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2WheelJointDef_get_collideConnected_0"];
var _emscripten_bind_b2MouseJointDef_set_userData_1 = Module["_emscripten_bind_b2MouseJointDef_set_userData_1"] = asm["_emscripten_bind_b2MouseJointDef_set_userData_1"];
var _emscripten_bind_b2FixtureDef_set_restitution_1 = Module["_emscripten_bind_b2FixtureDef_set_restitution_1"] = asm["_emscripten_bind_b2FixtureDef_set_restitution_1"];
var _emscripten_bind_b2RevoluteJoint_GetUserData_0 = Module["_emscripten_bind_b2RevoluteJoint_GetUserData_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetUserData_0"];
var _emscripten_bind_b2Mat33_get_ey_0 = Module["_emscripten_bind_b2Mat33_get_ey_0"] = asm["_emscripten_bind_b2Mat33_get_ey_0"];
var _emscripten_bind_b2MouseJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2MouseJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2MouseJoint_GetCollideConnected_0"];
var _emscripten_bind_b2World_GetGravity_0 = Module["_emscripten_bind_b2World_GetGravity_0"] = asm["_emscripten_bind_b2World_GetGravity_0"];
var _emscripten_bind_b2Mat33_set_ey_1 = Module["_emscripten_bind_b2Mat33_set_ey_1"] = asm["_emscripten_bind_b2Mat33_set_ey_1"];
var _emscripten_bind_b2Profile_get_broadphase_0 = Module["_emscripten_bind_b2Profile_get_broadphase_0"] = asm["_emscripten_bind_b2Profile_get_broadphase_0"];
var _emscripten_bind_b2PulleyJointDef_get_bodyA_0 = Module["_emscripten_bind_b2PulleyJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_bodyA_0"];
var _emscripten_bind_b2PrismaticJoint_SetLimits_2 = Module["_emscripten_bind_b2PrismaticJoint_SetLimits_2"] = asm["_emscripten_bind_b2PrismaticJoint_SetLimits_2"];
var _emscripten_bind_b2PulleyJointDef_get_localAnchorA_0 = Module["_emscripten_bind_b2PulleyJointDef_get_localAnchorA_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_localAnchorA_0"];
var _emscripten_bind_b2DistanceJoint_GetAnchorA_0 = Module["_emscripten_bind_b2DistanceJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2DistanceJoint_GetAnchorA_0"];
var _emscripten_bind_b2DistanceJointDef_set_userData_1 = Module["_emscripten_bind_b2DistanceJointDef_set_userData_1"] = asm["_emscripten_bind_b2DistanceJointDef_set_userData_1"];
var _emscripten_bind_b2DistanceJointDef_set_dampingRatio_1 = Module["_emscripten_bind_b2DistanceJointDef_set_dampingRatio_1"] = asm["_emscripten_bind_b2DistanceJointDef_set_dampingRatio_1"];
var _emscripten_bind_b2RopeJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2RopeJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2RopeJointDef_set_collideConnected_1"];
var _emscripten_bind_b2ChainShape_set_m_nextVertex_1 = Module["_emscripten_bind_b2ChainShape_set_m_nextVertex_1"] = asm["_emscripten_bind_b2ChainShape_set_m_nextVertex_1"];
var _emscripten_bind_JSContactListener_EndContact_1 = Module["_emscripten_bind_JSContactListener_EndContact_1"] = asm["_emscripten_bind_JSContactListener_EndContact_1"];
var _emscripten_bind_b2MassData_set_mass_1 = Module["_emscripten_bind_b2MassData_set_mass_1"] = asm["_emscripten_bind_b2MassData_set_mass_1"];
var _emscripten_bind_b2Vec3_get_x_0 = Module["_emscripten_bind_b2Vec3_get_x_0"] = asm["_emscripten_bind_b2Vec3_get_x_0"];
var _emscripten_bind_b2ChainShape_CreateChain_2 = Module["_emscripten_bind_b2ChainShape_CreateChain_2"] = asm["_emscripten_bind_b2ChainShape_CreateChain_2"];
var _emscripten_bind_b2RopeJoint_GetUserData_0 = Module["_emscripten_bind_b2RopeJoint_GetUserData_0"] = asm["_emscripten_bind_b2RopeJoint_GetUserData_0"];
var _emscripten_bind_b2World_DestroyBody_1 = Module["_emscripten_bind_b2World_DestroyBody_1"] = asm["_emscripten_bind_b2World_DestroyBody_1"];
var _emscripten_bind_b2Profile_get_solvePosition_0 = Module["_emscripten_bind_b2Profile_get_solvePosition_0"] = asm["_emscripten_bind_b2Profile_get_solvePosition_0"];
var _emscripten_bind_b2Shape_RayCast_4 = Module["_emscripten_bind_b2Shape_RayCast_4"] = asm["_emscripten_bind_b2Shape_RayCast_4"];
var _emscripten_bind_b2PulleyJoint_GetGroundAnchorA_0 = Module["_emscripten_bind_b2PulleyJoint_GetGroundAnchorA_0"] = asm["_emscripten_bind_b2PulleyJoint_GetGroundAnchorA_0"];
var _emscripten_bind_b2Mat33___destroy___0 = Module["_emscripten_bind_b2Mat33___destroy___0"] = asm["_emscripten_bind_b2Mat33___destroy___0"];
var _emscripten_bind_b2GearJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2GearJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2GearJoint_GetReactionTorque_1"];
var _emscripten_bind_b2WeldJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2WeldJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2WeldJointDef_set_collideConnected_1"];
var _emscripten_bind_b2JointDef_get_collideConnected_0 = Module["_emscripten_bind_b2JointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2JointDef_get_collideConnected_0"];
var _emscripten_bind_b2FrictionJointDef_get_maxTorque_0 = Module["_emscripten_bind_b2FrictionJointDef_get_maxTorque_0"] = asm["_emscripten_bind_b2FrictionJointDef_get_maxTorque_0"];
var _emscripten_bind_JSQueryCallback_JSQueryCallback_0 = Module["_emscripten_bind_JSQueryCallback_JSQueryCallback_0"] = asm["_emscripten_bind_JSQueryCallback_JSQueryCallback_0"];
var _emscripten_bind_b2World_SetAutoClearForces_1 = Module["_emscripten_bind_b2World_SetAutoClearForces_1"] = asm["_emscripten_bind_b2World_SetAutoClearForces_1"];
var _emscripten_bind_b2PrismaticJointDef_set_lowerTranslation_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_lowerTranslation_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_lowerTranslation_1"];
var _emscripten_bind_b2Contact_GetTangentSpeed_0 = Module["_emscripten_bind_b2Contact_GetTangentSpeed_0"] = asm["_emscripten_bind_b2Contact_GetTangentSpeed_0"];
var _emscripten_bind_b2BodyDef_set_position_1 = Module["_emscripten_bind_b2BodyDef_set_position_1"] = asm["_emscripten_bind_b2BodyDef_set_position_1"];
var _emscripten_bind_b2Transform_get_q_0 = Module["_emscripten_bind_b2Transform_get_q_0"] = asm["_emscripten_bind_b2Transform_get_q_0"];
var _emscripten_bind_b2PolygonShape_set_m_count_1 = Module["_emscripten_bind_b2PolygonShape_set_m_count_1"] = asm["_emscripten_bind_b2PolygonShape_set_m_count_1"];
var _emscripten_bind_b2Contact_GetNext_0 = Module["_emscripten_bind_b2Contact_GetNext_0"] = asm["_emscripten_bind_b2Contact_GetNext_0"];
var _emscripten_bind_b2MotorJointDef_set_userData_1 = Module["_emscripten_bind_b2MotorJointDef_set_userData_1"] = asm["_emscripten_bind_b2MotorJointDef_set_userData_1"];
var _emscripten_bind_b2GearJoint_GetJoint1_0 = Module["_emscripten_bind_b2GearJoint_GetJoint1_0"] = asm["_emscripten_bind_b2GearJoint_GetJoint1_0"];
var _emscripten_bind_b2World_GetProxyCount_0 = Module["_emscripten_bind_b2World_GetProxyCount_0"] = asm["_emscripten_bind_b2World_GetProxyCount_0"];
var _emscripten_bind_b2MotorJoint_SetMaxTorque_1 = Module["_emscripten_bind_b2MotorJoint_SetMaxTorque_1"] = asm["_emscripten_bind_b2MotorJoint_SetMaxTorque_1"];
var _emscripten_bind_b2GearJoint_GetAnchorA_0 = Module["_emscripten_bind_b2GearJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2GearJoint_GetAnchorA_0"];
var _emscripten_bind_b2MouseJointDef_set_bodyA_1 = Module["_emscripten_bind_b2MouseJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2MouseJointDef_set_bodyA_1"];
var _emscripten_bind_b2World_SetContactListener_1 = Module["_emscripten_bind_b2World_SetContactListener_1"] = asm["_emscripten_bind_b2World_SetContactListener_1"];
var _emscripten_bind_b2Body_IsAwake_0 = Module["_emscripten_bind_b2Body_IsAwake_0"] = asm["_emscripten_bind_b2Body_IsAwake_0"];
var _emscripten_bind_b2JointEdge_set_other_1 = Module["_emscripten_bind_b2JointEdge_set_other_1"] = asm["_emscripten_bind_b2JointEdge_set_other_1"];
var _emscripten_bind_b2MouseJointDef_set_target_1 = Module["_emscripten_bind_b2MouseJointDef_set_target_1"] = asm["_emscripten_bind_b2MouseJointDef_set_target_1"];
var _emscripten_bind_b2MotorJoint_SetCorrectionFactor_1 = Module["_emscripten_bind_b2MotorJoint_SetCorrectionFactor_1"] = asm["_emscripten_bind_b2MotorJoint_SetCorrectionFactor_1"];
var _emscripten_bind_b2FixtureDef_get_density_0 = Module["_emscripten_bind_b2FixtureDef_get_density_0"] = asm["_emscripten_bind_b2FixtureDef_get_density_0"];
var _emscripten_bind_b2GearJoint_GetRatio_0 = Module["_emscripten_bind_b2GearJoint_GetRatio_0"] = asm["_emscripten_bind_b2GearJoint_GetRatio_0"];
var _emscripten_bind_b2PrismaticJointDef_get_upperTranslation_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_upperTranslation_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_upperTranslation_0"];
var _emscripten_bind_b2RevoluteJoint_GetReferenceAngle_0 = Module["_emscripten_bind_b2RevoluteJoint_GetReferenceAngle_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetReferenceAngle_0"];
var _emscripten_bind_b2MotorJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2MotorJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2MotorJointDef_get_collideConnected_0"];
var _emscripten_enum_b2ManifoldType_e_circles = Module["_emscripten_enum_b2ManifoldType_e_circles"] = asm["_emscripten_enum_b2ManifoldType_e_circles"];
var _emscripten_bind_b2PulleyJointDef_set_localAnchorB_1 = Module["_emscripten_bind_b2PulleyJointDef_set_localAnchorB_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_localAnchorB_1"];
var _emscripten_bind_b2RevoluteJointDef_Initialize_3 = Module["_emscripten_bind_b2RevoluteJointDef_Initialize_3"] = asm["_emscripten_bind_b2RevoluteJointDef_Initialize_3"];
var _emscripten_bind_b2FixtureDef_get_userData_0 = Module["_emscripten_bind_b2FixtureDef_get_userData_0"] = asm["_emscripten_bind_b2FixtureDef_get_userData_0"];
var _emscripten_bind_b2DistanceJoint_GetUserData_0 = Module["_emscripten_bind_b2DistanceJoint_GetUserData_0"] = asm["_emscripten_bind_b2DistanceJoint_GetUserData_0"];
var _emscripten_bind_b2FrictionJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2FrictionJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2FrictionJointDef_set_collideConnected_1"];
var _emscripten_bind_b2PrismaticJointDef_get_lowerTranslation_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_lowerTranslation_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_lowerTranslation_0"];
var _emscripten_bind_b2GearJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2GearJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2GearJoint_GetCollideConnected_0"];
var _emscripten_bind_b2Filter_b2Filter_0 = Module["_emscripten_bind_b2Filter_b2Filter_0"] = asm["_emscripten_bind_b2Filter_b2Filter_0"];
var _emscripten_bind_b2MouseJointDef_set_type_1 = Module["_emscripten_bind_b2MouseJointDef_set_type_1"] = asm["_emscripten_bind_b2MouseJointDef_set_type_1"];
var _emscripten_bind_b2Body_ApplyAngularImpulse_2 = Module["_emscripten_bind_b2Body_ApplyAngularImpulse_2"] = asm["_emscripten_bind_b2Body_ApplyAngularImpulse_2"];
var _emscripten_enum_b2JointType_e_frictionJoint = Module["_emscripten_enum_b2JointType_e_frictionJoint"] = asm["_emscripten_enum_b2JointType_e_frictionJoint"];
var _emscripten_bind_b2RayCastOutput_set_fraction_1 = Module["_emscripten_bind_b2RayCastOutput_set_fraction_1"] = asm["_emscripten_bind_b2RayCastOutput_set_fraction_1"];
var _emscripten_bind_b2Color_set_r_1 = Module["_emscripten_bind_b2Color_set_r_1"] = asm["_emscripten_bind_b2Color_set_r_1"];
var _emscripten_bind_b2DistanceJointDef_get_length_0 = Module["_emscripten_bind_b2DistanceJointDef_get_length_0"] = asm["_emscripten_bind_b2DistanceJointDef_get_length_0"];
var _emscripten_bind_b2PulleyJoint_GetBodyB_0 = Module["_emscripten_bind_b2PulleyJoint_GetBodyB_0"] = asm["_emscripten_bind_b2PulleyJoint_GetBodyB_0"];
var _emscripten_bind_b2WheelJointDef_set_type_1 = Module["_emscripten_bind_b2WheelJointDef_set_type_1"] = asm["_emscripten_bind_b2WheelJointDef_set_type_1"];
var _emscripten_bind_b2World_GetTreeQuality_0 = Module["_emscripten_bind_b2World_GetTreeQuality_0"] = asm["_emscripten_bind_b2World_GetTreeQuality_0"];
var _emscripten_bind_b2BodyDef_set_gravityScale_1 = Module["_emscripten_bind_b2BodyDef_set_gravityScale_1"] = asm["_emscripten_bind_b2BodyDef_set_gravityScale_1"];
var _emscripten_bind_b2RopeJointDef_set_bodyB_1 = Module["_emscripten_bind_b2RopeJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2RopeJointDef_set_bodyB_1"];
var _emscripten_bind_b2PrismaticJoint_GetLowerLimit_0 = Module["_emscripten_bind_b2PrismaticJoint_GetLowerLimit_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetLowerLimit_0"];
var _emscripten_bind_b2AABB_get_lowerBound_0 = Module["_emscripten_bind_b2AABB_get_lowerBound_0"] = asm["_emscripten_bind_b2AABB_get_lowerBound_0"];
var _emscripten_bind_b2WheelJoint_SetMotorSpeed_1 = Module["_emscripten_bind_b2WheelJoint_SetMotorSpeed_1"] = asm["_emscripten_bind_b2WheelJoint_SetMotorSpeed_1"];
var _emscripten_bind_b2PrismaticJointDef_get_referenceAngle_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_referenceAngle_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_referenceAngle_0"];
var _emscripten_bind_b2Body_SetMassData_1 = Module["_emscripten_bind_b2Body_SetMassData_1"] = asm["_emscripten_bind_b2Body_SetMassData_1"];
var _emscripten_bind_b2BodyDef_get_angularVelocity_0 = Module["_emscripten_bind_b2BodyDef_get_angularVelocity_0"] = asm["_emscripten_bind_b2BodyDef_get_angularVelocity_0"];
var _emscripten_bind_b2WeldJoint_SetDampingRatio_1 = Module["_emscripten_bind_b2WeldJoint_SetDampingRatio_1"] = asm["_emscripten_bind_b2WeldJoint_SetDampingRatio_1"];
var _emscripten_bind_b2PrismaticJointDef___destroy___0 = Module["_emscripten_bind_b2PrismaticJointDef___destroy___0"] = asm["_emscripten_bind_b2PrismaticJointDef___destroy___0"];
var _emscripten_bind_b2Contact_IsTouching_0 = Module["_emscripten_bind_b2Contact_IsTouching_0"] = asm["_emscripten_bind_b2Contact_IsTouching_0"];
var _emscripten_bind_b2Draw_SetFlags_1 = Module["_emscripten_bind_b2Draw_SetFlags_1"] = asm["_emscripten_bind_b2Draw_SetFlags_1"];
var _emscripten_bind_b2AABB_Contains_1 = Module["_emscripten_bind_b2AABB_Contains_1"] = asm["_emscripten_bind_b2AABB_Contains_1"];
var _emscripten_bind_b2DistanceJoint_GetNext_0 = Module["_emscripten_bind_b2DistanceJoint_GetNext_0"] = asm["_emscripten_bind_b2DistanceJoint_GetNext_0"];
var _emscripten_bind_b2EdgeShape_set_m_radius_1 = Module["_emscripten_bind_b2EdgeShape_set_m_radius_1"] = asm["_emscripten_bind_b2EdgeShape_set_m_radius_1"];
var _emscripten_bind_b2DistanceJointDef_get_dampingRatio_0 = Module["_emscripten_bind_b2DistanceJointDef_get_dampingRatio_0"] = asm["_emscripten_bind_b2DistanceJointDef_get_dampingRatio_0"];
var _emscripten_bind_b2DistanceJoint_GetLocalAnchorA_0 = Module["_emscripten_bind_b2DistanceJoint_GetLocalAnchorA_0"] = asm["_emscripten_bind_b2DistanceJoint_GetLocalAnchorA_0"];
var _emscripten_bind_b2PrismaticJoint_GetType_0 = Module["_emscripten_bind_b2PrismaticJoint_GetType_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetType_0"];
var _emscripten_bind_b2Fixture_GetRestitution_0 = Module["_emscripten_bind_b2Fixture_GetRestitution_0"] = asm["_emscripten_bind_b2Fixture_GetRestitution_0"];
var _emscripten_bind_b2Transform_set_q_1 = Module["_emscripten_bind_b2Transform_set_q_1"] = asm["_emscripten_bind_b2Transform_set_q_1"];
var _emscripten_bind_b2PolygonShape___destroy___0 = Module["_emscripten_bind_b2PolygonShape___destroy___0"] = asm["_emscripten_bind_b2PolygonShape___destroy___0"];
var _emscripten_bind_b2AABB_get_upperBound_0 = Module["_emscripten_bind_b2AABB_get_upperBound_0"] = asm["_emscripten_bind_b2AABB_get_upperBound_0"];
var _emscripten_bind_b2Transform___destroy___0 = Module["_emscripten_bind_b2Transform___destroy___0"] = asm["_emscripten_bind_b2Transform___destroy___0"];
var _emscripten_bind_b2Body_GetLinearVelocity_0 = Module["_emscripten_bind_b2Body_GetLinearVelocity_0"] = asm["_emscripten_bind_b2Body_GetLinearVelocity_0"];
var _emscripten_bind_b2CircleShape_set_m_radius_1 = Module["_emscripten_bind_b2CircleShape_set_m_radius_1"] = asm["_emscripten_bind_b2CircleShape_set_m_radius_1"];
var _emscripten_bind_b2EdgeShape_set_m_hasVertex0_1 = Module["_emscripten_bind_b2EdgeShape_set_m_hasVertex0_1"] = asm["_emscripten_bind_b2EdgeShape_set_m_hasVertex0_1"];
var _emscripten_bind_b2RopeJoint_GetMaxLength_0 = Module["_emscripten_bind_b2RopeJoint_GetMaxLength_0"] = asm["_emscripten_bind_b2RopeJoint_GetMaxLength_0"];
var _emscripten_bind_b2GearJoint_GetUserData_0 = Module["_emscripten_bind_b2GearJoint_GetUserData_0"] = asm["_emscripten_bind_b2GearJoint_GetUserData_0"];
var _emscripten_bind_b2MotorJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2MotorJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2MotorJoint_GetCollideConnected_0"];
var _emscripten_bind_b2GearJointDef_set_type_1 = Module["_emscripten_bind_b2GearJointDef_set_type_1"] = asm["_emscripten_bind_b2GearJointDef_set_type_1"];
var _emscripten_bind_b2DistanceJoint_SetDampingRatio_1 = Module["_emscripten_bind_b2DistanceJoint_SetDampingRatio_1"] = asm["_emscripten_bind_b2DistanceJoint_SetDampingRatio_1"];
var _emscripten_bind_b2Contact_GetFixtureA_0 = Module["_emscripten_bind_b2Contact_GetFixtureA_0"] = asm["_emscripten_bind_b2Contact_GetFixtureA_0"];
var _emscripten_bind_b2PulleyJointDef_get_ratio_0 = Module["_emscripten_bind_b2PulleyJointDef_get_ratio_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_ratio_0"];
var _emscripten_bind_b2PrismaticJointDef_get_localAnchorB_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_localAnchorB_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_localAnchorB_0"];
var _emscripten_bind_b2CircleShape_set_m_type_1 = Module["_emscripten_bind_b2CircleShape_set_m_type_1"] = asm["_emscripten_bind_b2CircleShape_set_m_type_1"];
var _emscripten_bind_b2DistanceJointDef_set_localAnchorA_1 = Module["_emscripten_bind_b2DistanceJointDef_set_localAnchorA_1"] = asm["_emscripten_bind_b2DistanceJointDef_set_localAnchorA_1"];
var _emscripten_bind_b2RopeJoint_GetAnchorB_0 = Module["_emscripten_bind_b2RopeJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2RopeJoint_GetAnchorB_0"];
var _emscripten_bind_b2AABB_set_upperBound_1 = Module["_emscripten_bind_b2AABB_set_upperBound_1"] = asm["_emscripten_bind_b2AABB_set_upperBound_1"];
var _emscripten_bind_JSRayCastCallback_ReportFixture_4 = Module["_emscripten_bind_JSRayCastCallback_ReportFixture_4"] = asm["_emscripten_bind_JSRayCastCallback_ReportFixture_4"];
var _emscripten_bind_b2ContactImpulse___destroy___0 = Module["_emscripten_bind_b2ContactImpulse___destroy___0"] = asm["_emscripten_bind_b2ContactImpulse___destroy___0"];
var _emscripten_bind_b2FrictionJointDef_get_localAnchorB_0 = Module["_emscripten_bind_b2FrictionJointDef_get_localAnchorB_0"] = asm["_emscripten_bind_b2FrictionJointDef_get_localAnchorB_0"];
var _emscripten_bind_b2PulleyJointDef_set_lengthB_1 = Module["_emscripten_bind_b2PulleyJointDef_set_lengthB_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_lengthB_1"];
var _emscripten_bind_b2RayCastInput___destroy___0 = Module["_emscripten_bind_b2RayCastInput___destroy___0"] = asm["_emscripten_bind_b2RayCastInput___destroy___0"];
var _emscripten_bind_b2Body_ApplyForceToCenter_2 = Module["_emscripten_bind_b2Body_ApplyForceToCenter_2"] = asm["_emscripten_bind_b2Body_ApplyForceToCenter_2"];
var _emscripten_bind_JSDestructionListener_JSDestructionListener_0 = Module["_emscripten_bind_JSDestructionListener_JSDestructionListener_0"] = asm["_emscripten_bind_JSDestructionListener_JSDestructionListener_0"];
var _emscripten_bind_b2WheelJointDef_set_localAnchorA_1 = Module["_emscripten_bind_b2WheelJointDef_set_localAnchorA_1"] = asm["_emscripten_bind_b2WheelJointDef_set_localAnchorA_1"];
var _emscripten_bind_b2FrictionJoint_GetBodyB_0 = Module["_emscripten_bind_b2FrictionJoint_GetBodyB_0"] = asm["_emscripten_bind_b2FrictionJoint_GetBodyB_0"];
var _emscripten_bind_b2WeldJointDef_set_bodyA_1 = Module["_emscripten_bind_b2WeldJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2WeldJointDef_set_bodyA_1"];
var _emscripten_bind_b2DistanceJoint_GetBodyB_0 = Module["_emscripten_bind_b2DistanceJoint_GetBodyB_0"] = asm["_emscripten_bind_b2DistanceJoint_GetBodyB_0"];
var _emscripten_enum_b2JointType_e_wheelJoint = Module["_emscripten_enum_b2JointType_e_wheelJoint"] = asm["_emscripten_enum_b2JointType_e_wheelJoint"];
var _emscripten_bind_b2JointDef___destroy___0 = Module["_emscripten_bind_b2JointDef___destroy___0"] = asm["_emscripten_bind_b2JointDef___destroy___0"];
var _emscripten_bind_b2ContactEdge___destroy___0 = Module["_emscripten_bind_b2ContactEdge___destroy___0"] = asm["_emscripten_bind_b2ContactEdge___destroy___0"];
var _emscripten_bind_b2Filter_get_groupIndex_0 = Module["_emscripten_bind_b2Filter_get_groupIndex_0"] = asm["_emscripten_bind_b2Filter_get_groupIndex_0"];
var _emscripten_bind_b2FrictionJointDef_get_localAnchorA_0 = Module["_emscripten_bind_b2FrictionJointDef_get_localAnchorA_0"] = asm["_emscripten_bind_b2FrictionJointDef_get_localAnchorA_0"];
var _emscripten_bind_b2CircleShape_GetChildCount_0 = Module["_emscripten_bind_b2CircleShape_GetChildCount_0"] = asm["_emscripten_bind_b2CircleShape_GetChildCount_0"];
var _emscripten_bind_b2BodyDef_get_bullet_0 = Module["_emscripten_bind_b2BodyDef_get_bullet_0"] = asm["_emscripten_bind_b2BodyDef_get_bullet_0"];
var _emscripten_bind_b2Color_set_b_1 = Module["_emscripten_bind_b2Color_set_b_1"] = asm["_emscripten_bind_b2Color_set_b_1"];
var _emscripten_bind_b2Mat33_get_ez_0 = Module["_emscripten_bind_b2Mat33_get_ez_0"] = asm["_emscripten_bind_b2Mat33_get_ez_0"];
var _emscripten_bind_b2MassData_get_center_0 = Module["_emscripten_bind_b2MassData_get_center_0"] = asm["_emscripten_bind_b2MassData_get_center_0"];
var _emscripten_bind_b2WeldJoint_GetBodyB_0 = Module["_emscripten_bind_b2WeldJoint_GetBodyB_0"] = asm["_emscripten_bind_b2WeldJoint_GetBodyB_0"];
var _emscripten_bind_b2WheelJoint_GetReactionForce_1 = Module["_emscripten_bind_b2WheelJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2WheelJoint_GetReactionForce_1"];
var _emscripten_bind_b2World_SetSubStepping_1 = Module["_emscripten_bind_b2World_SetSubStepping_1"] = asm["_emscripten_bind_b2World_SetSubStepping_1"];
var _emscripten_bind_b2Vec2_op_add_1 = Module["_emscripten_bind_b2Vec2_op_add_1"] = asm["_emscripten_bind_b2Vec2_op_add_1"];
var _emscripten_bind_JSDraw_DrawSegment_3 = Module["_emscripten_bind_JSDraw_DrawSegment_3"] = asm["_emscripten_bind_JSDraw_DrawSegment_3"];
var _emscripten_bind_b2Joint_GetCollideConnected_0 = Module["_emscripten_bind_b2Joint_GetCollideConnected_0"] = asm["_emscripten_bind_b2Joint_GetCollideConnected_0"];
var _emscripten_bind_b2MotorJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2MotorJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2MotorJoint_GetReactionTorque_1"];
var _emscripten_bind_b2FrictionJointDef_get_bodyB_0 = Module["_emscripten_bind_b2FrictionJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2FrictionJointDef_get_bodyB_0"];
var _emscripten_bind_b2WheelJointDef___destroy___0 = Module["_emscripten_bind_b2WheelJointDef___destroy___0"] = asm["_emscripten_bind_b2WheelJointDef___destroy___0"];
var _emscripten_bind_b2BodyDef_get_gravityScale_0 = Module["_emscripten_bind_b2BodyDef_get_gravityScale_0"] = asm["_emscripten_bind_b2BodyDef_get_gravityScale_0"];
var _emscripten_bind_b2Vec3_SetZero_0 = Module["_emscripten_bind_b2Vec3_SetZero_0"] = asm["_emscripten_bind_b2Vec3_SetZero_0"];
var _emscripten_enum_b2JointType_e_pulleyJoint = Module["_emscripten_enum_b2JointType_e_pulleyJoint"] = asm["_emscripten_enum_b2JointType_e_pulleyJoint"];
var _emscripten_bind_b2ChainShape_get_m_nextVertex_0 = Module["_emscripten_bind_b2ChainShape_get_m_nextVertex_0"] = asm["_emscripten_bind_b2ChainShape_get_m_nextVertex_0"];
var _emscripten_bind_b2Contact_SetEnabled_1 = Module["_emscripten_bind_b2Contact_SetEnabled_1"] = asm["_emscripten_bind_b2Contact_SetEnabled_1"];
var _emscripten_bind_b2Shape_set_m_radius_1 = Module["_emscripten_bind_b2Shape_set_m_radius_1"] = asm["_emscripten_bind_b2Shape_set_m_radius_1"];
var _emscripten_bind_b2World_SetDebugDraw_1 = Module["_emscripten_bind_b2World_SetDebugDraw_1"] = asm["_emscripten_bind_b2World_SetDebugDraw_1"];
var _emscripten_bind_b2ContactID_set_key_1 = Module["_emscripten_bind_b2ContactID_set_key_1"] = asm["_emscripten_bind_b2ContactID_set_key_1"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _emscripten_bind_b2WheelJoint_GetMaxMotorTorque_0 = Module["_emscripten_bind_b2WheelJoint_GetMaxMotorTorque_0"] = asm["_emscripten_bind_b2WheelJoint_GetMaxMotorTorque_0"];
var _emscripten_bind_b2Vec2_Normalize_0 = Module["_emscripten_bind_b2Vec2_Normalize_0"] = asm["_emscripten_bind_b2Vec2_Normalize_0"];
var _emscripten_bind_b2WheelJoint_GetJointSpeed_0 = Module["_emscripten_bind_b2WheelJoint_GetJointSpeed_0"] = asm["_emscripten_bind_b2WheelJoint_GetJointSpeed_0"];
var _emscripten_bind_b2FrictionJointDef_set_localAnchorA_1 = Module["_emscripten_bind_b2FrictionJointDef_set_localAnchorA_1"] = asm["_emscripten_bind_b2FrictionJointDef_set_localAnchorA_1"];
var _emscripten_bind_b2ChainShape_set_m_vertices_1 = Module["_emscripten_bind_b2ChainShape_set_m_vertices_1"] = asm["_emscripten_bind_b2ChainShape_set_m_vertices_1"];
var _emscripten_bind_JSRayCastCallback_JSRayCastCallback_0 = Module["_emscripten_bind_JSRayCastCallback_JSRayCastCallback_0"] = asm["_emscripten_bind_JSRayCastCallback_JSRayCastCallback_0"];
var _emscripten_bind_b2RayCastInput_set_p2_1 = Module["_emscripten_bind_b2RayCastInput_set_p2_1"] = asm["_emscripten_bind_b2RayCastInput_set_p2_1"];
var _emscripten_bind_b2RevoluteJointDef_get_motorSpeed_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_motorSpeed_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_motorSpeed_0"];
var _emscripten_bind_b2Manifold_get_pointCount_0 = Module["_emscripten_bind_b2Manifold_get_pointCount_0"] = asm["_emscripten_bind_b2Manifold_get_pointCount_0"];
var _emscripten_bind_b2RayCastOutput_get_normal_0 = Module["_emscripten_bind_b2RayCastOutput_get_normal_0"] = asm["_emscripten_bind_b2RayCastOutput_get_normal_0"];
var _emscripten_bind_b2WeldJoint_GetBodyA_0 = Module["_emscripten_bind_b2WeldJoint_GetBodyA_0"] = asm["_emscripten_bind_b2WeldJoint_GetBodyA_0"];
var _emscripten_enum_b2DrawFlag_e_jointBit = Module["_emscripten_enum_b2DrawFlag_e_jointBit"] = asm["_emscripten_enum_b2DrawFlag_e_jointBit"];
var _emscripten_bind_b2FixtureDef_get_isSensor_0 = Module["_emscripten_bind_b2FixtureDef_get_isSensor_0"] = asm["_emscripten_bind_b2FixtureDef_get_isSensor_0"];
var _emscripten_bind_b2PrismaticJointDef_Initialize_4 = Module["_emscripten_bind_b2PrismaticJointDef_Initialize_4"] = asm["_emscripten_bind_b2PrismaticJointDef_Initialize_4"];
var _emscripten_bind_b2PulleyJointDef_set_bodyB_1 = Module["_emscripten_bind_b2PulleyJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_bodyB_1"];
var _emscripten_bind_b2WheelJoint_EnableMotor_1 = Module["_emscripten_bind_b2WheelJoint_EnableMotor_1"] = asm["_emscripten_bind_b2WheelJoint_EnableMotor_1"];
var _emscripten_bind_b2RevoluteJoint_GetJointSpeed_0 = Module["_emscripten_bind_b2RevoluteJoint_GetJointSpeed_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetJointSpeed_0"];
var _emscripten_bind_JSDraw_DrawSolidPolygon_3 = Module["_emscripten_bind_JSDraw_DrawSolidPolygon_3"] = asm["_emscripten_bind_JSDraw_DrawSolidPolygon_3"];
var _emscripten_bind_b2Rot_Set_1 = Module["_emscripten_bind_b2Rot_Set_1"] = asm["_emscripten_bind_b2Rot_Set_1"];
var _emscripten_bind_b2RevoluteJoint_GetJointAngle_0 = Module["_emscripten_bind_b2RevoluteJoint_GetJointAngle_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetJointAngle_0"];
var _emscripten_bind_JSDraw___destroy___0 = Module["_emscripten_bind_JSDraw___destroy___0"] = asm["_emscripten_bind_JSDraw___destroy___0"];
var _emscripten_bind_b2MouseJointDef___destroy___0 = Module["_emscripten_bind_b2MouseJointDef___destroy___0"] = asm["_emscripten_bind_b2MouseJointDef___destroy___0"];
var _emscripten_bind_b2Mat33_Solve22_1 = Module["_emscripten_bind_b2Mat33_Solve22_1"] = asm["_emscripten_bind_b2Mat33_Solve22_1"];
var _emscripten_bind_b2Profile_set_solvePosition_1 = Module["_emscripten_bind_b2Profile_set_solvePosition_1"] = asm["_emscripten_bind_b2Profile_set_solvePosition_1"];
var _emscripten_bind_b2ContactFilter___destroy___0 = Module["_emscripten_bind_b2ContactFilter___destroy___0"] = asm["_emscripten_bind_b2ContactFilter___destroy___0"];
var _emscripten_bind_b2WheelJoint_GetLocalAnchorA_0 = Module["_emscripten_bind_b2WheelJoint_GetLocalAnchorA_0"] = asm["_emscripten_bind_b2WheelJoint_GetLocalAnchorA_0"];
var _emscripten_bind_b2ChainShape_set_m_hasPrevVertex_1 = Module["_emscripten_bind_b2ChainShape_set_m_hasPrevVertex_1"] = asm["_emscripten_bind_b2ChainShape_set_m_hasPrevVertex_1"];
var _emscripten_bind_b2DistanceJoint_SetUserData_1 = Module["_emscripten_bind_b2DistanceJoint_SetUserData_1"] = asm["_emscripten_bind_b2DistanceJoint_SetUserData_1"];
var _emscripten_bind_b2PrismaticJoint___destroy___0 = Module["_emscripten_bind_b2PrismaticJoint___destroy___0"] = asm["_emscripten_bind_b2PrismaticJoint___destroy___0"];
var _emscripten_bind_b2RopeJointDef_set_bodyA_1 = Module["_emscripten_bind_b2RopeJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2RopeJointDef_set_bodyA_1"];
var _emscripten_bind_b2GearJoint___destroy___0 = Module["_emscripten_bind_b2GearJoint___destroy___0"] = asm["_emscripten_bind_b2GearJoint___destroy___0"];
var _emscripten_bind_b2PrismaticJoint_GetJointTranslation_0 = Module["_emscripten_bind_b2PrismaticJoint_GetJointTranslation_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetJointTranslation_0"];
var _emscripten_bind_b2ManifoldPoint_get_id_0 = Module["_emscripten_bind_b2ManifoldPoint_get_id_0"] = asm["_emscripten_bind_b2ManifoldPoint_get_id_0"];
var _emscripten_bind_b2CircleShape_get_m_radius_0 = Module["_emscripten_bind_b2CircleShape_get_m_radius_0"] = asm["_emscripten_bind_b2CircleShape_get_m_radius_0"];
var _emscripten_bind_b2PrismaticJoint_GetMotorSpeed_0 = Module["_emscripten_bind_b2PrismaticJoint_GetMotorSpeed_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetMotorSpeed_0"];
var _emscripten_bind_b2PulleyJoint_GetGroundAnchorB_0 = Module["_emscripten_bind_b2PulleyJoint_GetGroundAnchorB_0"] = asm["_emscripten_bind_b2PulleyJoint_GetGroundAnchorB_0"];
var _emscripten_bind_b2Vec3_op_add_1 = Module["_emscripten_bind_b2Vec3_op_add_1"] = asm["_emscripten_bind_b2Vec3_op_add_1"];
var _emscripten_bind_b2FrictionJoint_GetType_0 = Module["_emscripten_bind_b2FrictionJoint_GetType_0"] = asm["_emscripten_bind_b2FrictionJoint_GetType_0"];
var _emscripten_bind_b2MouseJoint_GetMaxForce_0 = Module["_emscripten_bind_b2MouseJoint_GetMaxForce_0"] = asm["_emscripten_bind_b2MouseJoint_GetMaxForce_0"];
var _emscripten_bind_b2MouseJoint_SetTarget_1 = Module["_emscripten_bind_b2MouseJoint_SetTarget_1"] = asm["_emscripten_bind_b2MouseJoint_SetTarget_1"];
var _emscripten_bind_b2MouseJointDef_get_dampingRatio_0 = Module["_emscripten_bind_b2MouseJointDef_get_dampingRatio_0"] = asm["_emscripten_bind_b2MouseJointDef_get_dampingRatio_0"];
var _emscripten_bind_b2RevoluteJoint_GetMotorSpeed_0 = Module["_emscripten_bind_b2RevoluteJoint_GetMotorSpeed_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetMotorSpeed_0"];
var _emscripten_bind_b2ChainShape_set_m_type_1 = Module["_emscripten_bind_b2ChainShape_set_m_type_1"] = asm["_emscripten_bind_b2ChainShape_set_m_type_1"];
var _emscripten_bind_b2RevoluteJointDef_set_bodyB_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_bodyB_1"];
var _emscripten_bind_b2Rot_GetXAxis_0 = Module["_emscripten_bind_b2Rot_GetXAxis_0"] = asm["_emscripten_bind_b2Rot_GetXAxis_0"];
var _emscripten_bind_b2Mat33_b2Mat33_0 = Module["_emscripten_bind_b2Mat33_b2Mat33_0"] = asm["_emscripten_bind_b2Mat33_b2Mat33_0"];
var _emscripten_bind_b2MouseJointDef_get_bodyB_0 = Module["_emscripten_bind_b2MouseJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2MouseJointDef_get_bodyB_0"];
var _emscripten_bind_b2Body_GetWorldVector_1 = Module["_emscripten_bind_b2Body_GetWorldVector_1"] = asm["_emscripten_bind_b2Body_GetWorldVector_1"];
var _emscripten_bind_b2WeldJointDef_get_frequencyHz_0 = Module["_emscripten_bind_b2WeldJointDef_get_frequencyHz_0"] = asm["_emscripten_bind_b2WeldJointDef_get_frequencyHz_0"];
var _emscripten_bind_b2GearJointDef_set_ratio_1 = Module["_emscripten_bind_b2GearJointDef_set_ratio_1"] = asm["_emscripten_bind_b2GearJointDef_set_ratio_1"];
var _emscripten_bind_b2Manifold___destroy___0 = Module["_emscripten_bind_b2Manifold___destroy___0"] = asm["_emscripten_bind_b2Manifold___destroy___0"];
var _emscripten_bind_b2PulleyJointDef_set_lengthA_1 = Module["_emscripten_bind_b2PulleyJointDef_set_lengthA_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_lengthA_1"];
var _emscripten_bind_b2Contact_IsEnabled_0 = Module["_emscripten_bind_b2Contact_IsEnabled_0"] = asm["_emscripten_bind_b2Contact_IsEnabled_0"];
var _emscripten_bind_b2World_CreateJoint_1 = Module["_emscripten_bind_b2World_CreateJoint_1"] = asm["_emscripten_bind_b2World_CreateJoint_1"];
var _emscripten_bind_b2PulleyJointDef_set_ratio_1 = Module["_emscripten_bind_b2PulleyJointDef_set_ratio_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_ratio_1"];
var _emscripten_bind_b2JointEdge_set_prev_1 = Module["_emscripten_bind_b2JointEdge_set_prev_1"] = asm["_emscripten_bind_b2JointEdge_set_prev_1"];
var _emscripten_bind_b2PrismaticJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2PrismaticJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2PrismaticJoint_GetReactionTorque_1"];
var _emscripten_bind_b2Body_GetLocalPoint_1 = Module["_emscripten_bind_b2Body_GetLocalPoint_1"] = asm["_emscripten_bind_b2Body_GetLocalPoint_1"];
var _emscripten_bind_b2PrismaticJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2PrismaticJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetCollideConnected_0"];
var _emscripten_bind_b2DistanceJoint_IsActive_0 = Module["_emscripten_bind_b2DistanceJoint_IsActive_0"] = asm["_emscripten_bind_b2DistanceJoint_IsActive_0"];
var _emscripten_bind_b2RopeJoint_GetLimitState_0 = Module["_emscripten_bind_b2RopeJoint_GetLimitState_0"] = asm["_emscripten_bind_b2RopeJoint_GetLimitState_0"];
var _emscripten_bind_b2Profile_get_solveTOI_0 = Module["_emscripten_bind_b2Profile_get_solveTOI_0"] = asm["_emscripten_bind_b2Profile_get_solveTOI_0"];
var _emscripten_bind_b2Vec2_b2Vec2_0 = Module["_emscripten_bind_b2Vec2_b2Vec2_0"] = asm["_emscripten_bind_b2Vec2_b2Vec2_0"];
var _emscripten_bind_b2DistanceJoint_GetAnchorB_0 = Module["_emscripten_bind_b2DistanceJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2DistanceJoint_GetAnchorB_0"];
var _emscripten_bind_b2WheelJointDef_get_maxMotorTorque_0 = Module["_emscripten_bind_b2WheelJointDef_get_maxMotorTorque_0"] = asm["_emscripten_bind_b2WheelJointDef_get_maxMotorTorque_0"];
var _emscripten_bind_b2Vec2_op_sub_1 = Module["_emscripten_bind_b2Vec2_op_sub_1"] = asm["_emscripten_bind_b2Vec2_op_sub_1"];
var _emscripten_bind_b2CircleShape_get_m_p_0 = Module["_emscripten_bind_b2CircleShape_get_m_p_0"] = asm["_emscripten_bind_b2CircleShape_get_m_p_0"];
var _emscripten_bind_b2ContactFeature_get_indexA_0 = Module["_emscripten_bind_b2ContactFeature_get_indexA_0"] = asm["_emscripten_bind_b2ContactFeature_get_indexA_0"];
var _emscripten_bind_b2MotorJointDef_b2MotorJointDef_0 = Module["_emscripten_bind_b2MotorJointDef_b2MotorJointDef_0"] = asm["_emscripten_bind_b2MotorJointDef_b2MotorJointDef_0"];
var _emscripten_bind_b2RevoluteJoint_EnableLimit_1 = Module["_emscripten_bind_b2RevoluteJoint_EnableLimit_1"] = asm["_emscripten_bind_b2RevoluteJoint_EnableLimit_1"];
var _emscripten_bind_b2ContactEdge_get_next_0 = Module["_emscripten_bind_b2ContactEdge_get_next_0"] = asm["_emscripten_bind_b2ContactEdge_get_next_0"];
var _emscripten_bind_b2AABB_GetPerimeter_0 = Module["_emscripten_bind_b2AABB_GetPerimeter_0"] = asm["_emscripten_bind_b2AABB_GetPerimeter_0"];
var _emscripten_bind_b2RevoluteJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2RevoluteJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetCollideConnected_0"];
var _emscripten_bind_b2Mat33_get_ex_0 = Module["_emscripten_bind_b2Mat33_get_ex_0"] = asm["_emscripten_bind_b2Mat33_get_ex_0"];
var _emscripten_bind_b2Body_GetPosition_0 = Module["_emscripten_bind_b2Body_GetPosition_0"] = asm["_emscripten_bind_b2Body_GetPosition_0"];
var _emscripten_bind_b2Profile___destroy___0 = Module["_emscripten_bind_b2Profile___destroy___0"] = asm["_emscripten_bind_b2Profile___destroy___0"];
var _emscripten_bind_b2ContactEdge_get_prev_0 = Module["_emscripten_bind_b2ContactEdge_get_prev_0"] = asm["_emscripten_bind_b2ContactEdge_get_prev_0"];
var _emscripten_bind_b2DistanceJoint_SetFrequency_1 = Module["_emscripten_bind_b2DistanceJoint_SetFrequency_1"] = asm["_emscripten_bind_b2DistanceJoint_SetFrequency_1"];
var _emscripten_bind_b2Fixture_GetBody_0 = Module["_emscripten_bind_b2Fixture_GetBody_0"] = asm["_emscripten_bind_b2Fixture_GetBody_0"];
var _emscripten_bind_b2ContactImpulse_set_count_1 = Module["_emscripten_bind_b2ContactImpulse_set_count_1"] = asm["_emscripten_bind_b2ContactImpulse_set_count_1"];
var _emscripten_bind_b2FixtureDef_set_shape_1 = Module["_emscripten_bind_b2FixtureDef_set_shape_1"] = asm["_emscripten_bind_b2FixtureDef_set_shape_1"];
var _emscripten_bind_b2PulleyJointDef_get_bodyB_0 = Module["_emscripten_bind_b2PulleyJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_bodyB_0"];
var _emscripten_bind_b2ChainShape_GetChildCount_0 = Module["_emscripten_bind_b2ChainShape_GetChildCount_0"] = asm["_emscripten_bind_b2ChainShape_GetChildCount_0"];
var _emscripten_bind_b2CircleShape_b2CircleShape_0 = Module["_emscripten_bind_b2CircleShape_b2CircleShape_0"] = asm["_emscripten_bind_b2CircleShape_b2CircleShape_0"];
var _emscripten_bind_b2RevoluteJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2RevoluteJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2RevoluteJoint_GetReactionTorque_1"];
var _emscripten_bind_b2Fixture_SetDensity_1 = Module["_emscripten_bind_b2Fixture_SetDensity_1"] = asm["_emscripten_bind_b2Fixture_SetDensity_1"];
var _emscripten_bind_b2ChainShape_get_m_prevVertex_0 = Module["_emscripten_bind_b2ChainShape_get_m_prevVertex_0"] = asm["_emscripten_bind_b2ChainShape_get_m_prevVertex_0"];
var _emscripten_bind_b2AABB_GetExtents_0 = Module["_emscripten_bind_b2AABB_GetExtents_0"] = asm["_emscripten_bind_b2AABB_GetExtents_0"];
var _emscripten_bind_b2World_ClearForces_0 = Module["_emscripten_bind_b2World_ClearForces_0"] = asm["_emscripten_bind_b2World_ClearForces_0"];
var _emscripten_bind_b2Vec3___destroy___0 = Module["_emscripten_bind_b2Vec3___destroy___0"] = asm["_emscripten_bind_b2Vec3___destroy___0"];
var _emscripten_bind_b2WheelJointDef_set_userData_1 = Module["_emscripten_bind_b2WheelJointDef_set_userData_1"] = asm["_emscripten_bind_b2WheelJointDef_set_userData_1"];
var _emscripten_bind_b2WeldJoint_SetFrequency_1 = Module["_emscripten_bind_b2WeldJoint_SetFrequency_1"] = asm["_emscripten_bind_b2WeldJoint_SetFrequency_1"];
var _emscripten_bind_JSContactListener_PreSolve_2 = Module["_emscripten_bind_JSContactListener_PreSolve_2"] = asm["_emscripten_bind_JSContactListener_PreSolve_2"];
var _emscripten_bind_b2Body_SetFixedRotation_1 = Module["_emscripten_bind_b2Body_SetFixedRotation_1"] = asm["_emscripten_bind_b2Body_SetFixedRotation_1"];
var _emscripten_bind_b2RayCastOutput_set_normal_1 = Module["_emscripten_bind_b2RayCastOutput_set_normal_1"] = asm["_emscripten_bind_b2RayCastOutput_set_normal_1"];
var _emscripten_bind_b2DistanceJoint_GetDampingRatio_0 = Module["_emscripten_bind_b2DistanceJoint_GetDampingRatio_0"] = asm["_emscripten_bind_b2DistanceJoint_GetDampingRatio_0"];
var _emscripten_bind_b2RevoluteJoint_SetMaxMotorTorque_1 = Module["_emscripten_bind_b2RevoluteJoint_SetMaxMotorTorque_1"] = asm["_emscripten_bind_b2RevoluteJoint_SetMaxMotorTorque_1"];
var _emscripten_bind_b2RevoluteJoint_EnableMotor_1 = Module["_emscripten_bind_b2RevoluteJoint_EnableMotor_1"] = asm["_emscripten_bind_b2RevoluteJoint_EnableMotor_1"];
var _emscripten_bind_b2Contact_GetChildIndexB_0 = Module["_emscripten_bind_b2Contact_GetChildIndexB_0"] = asm["_emscripten_bind_b2Contact_GetChildIndexB_0"];
var _emscripten_bind_b2MouseJointDef_set_bodyB_1 = Module["_emscripten_bind_b2MouseJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2MouseJointDef_set_bodyB_1"];
var _emscripten_bind_b2CircleShape_GetType_0 = Module["_emscripten_bind_b2CircleShape_GetType_0"] = asm["_emscripten_bind_b2CircleShape_GetType_0"];
var _emscripten_bind_b2PolygonShape_GetType_0 = Module["_emscripten_bind_b2PolygonShape_GetType_0"] = asm["_emscripten_bind_b2PolygonShape_GetType_0"];
var _emscripten_bind_b2PrismaticJointDef_set_referenceAngle_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_referenceAngle_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_referenceAngle_1"];
var _emscripten_bind_b2RopeJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2RopeJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2RopeJointDef_get_collideConnected_0"];
var _emscripten_bind_b2FixtureDef_set_filter_1 = Module["_emscripten_bind_b2FixtureDef_set_filter_1"] = asm["_emscripten_bind_b2FixtureDef_set_filter_1"];
var _emscripten_bind_b2Body_ApplyTorque_2 = Module["_emscripten_bind_b2Body_ApplyTorque_2"] = asm["_emscripten_bind_b2Body_ApplyTorque_2"];
var _emscripten_bind_b2RevoluteJoint___destroy___0 = Module["_emscripten_bind_b2RevoluteJoint___destroy___0"] = asm["_emscripten_bind_b2RevoluteJoint___destroy___0"];
var _emscripten_bind_b2FrictionJointDef_get_userData_0 = Module["_emscripten_bind_b2FrictionJointDef_get_userData_0"] = asm["_emscripten_bind_b2FrictionJointDef_get_userData_0"];
var _emscripten_bind_b2RayCastCallback___destroy___0 = Module["_emscripten_bind_b2RayCastCallback___destroy___0"] = asm["_emscripten_bind_b2RayCastCallback___destroy___0"];
var _emscripten_bind_b2RevoluteJointDef_set_bodyA_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_bodyA_1"];
var _emscripten_bind_b2MotorJoint_SetUserData_1 = Module["_emscripten_bind_b2MotorJoint_SetUserData_1"] = asm["_emscripten_bind_b2MotorJoint_SetUserData_1"];
var _emscripten_bind_b2PrismaticJoint_GetLocalAxisA_0 = Module["_emscripten_bind_b2PrismaticJoint_GetLocalAxisA_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetLocalAxisA_0"];
var _emscripten_bind_b2MotorJoint_GetBodyB_0 = Module["_emscripten_bind_b2MotorJoint_GetBodyB_0"] = asm["_emscripten_bind_b2MotorJoint_GetBodyB_0"];
var _emscripten_bind_b2Transform_Set_2 = Module["_emscripten_bind_b2Transform_Set_2"] = asm["_emscripten_bind_b2Transform_Set_2"];
var _emscripten_bind_b2MotorJoint_GetBodyA_0 = Module["_emscripten_bind_b2MotorJoint_GetBodyA_0"] = asm["_emscripten_bind_b2MotorJoint_GetBodyA_0"];
var _emscripten_bind_b2Draw_AppendFlags_1 = Module["_emscripten_bind_b2Draw_AppendFlags_1"] = asm["_emscripten_bind_b2Draw_AppendFlags_1"];
var _emscripten_bind_b2EdgeShape_GetChildCount_0 = Module["_emscripten_bind_b2EdgeShape_GetChildCount_0"] = asm["_emscripten_bind_b2EdgeShape_GetChildCount_0"];
var _emscripten_bind_b2Contact_ResetFriction_0 = Module["_emscripten_bind_b2Contact_ResetFriction_0"] = asm["_emscripten_bind_b2Contact_ResetFriction_0"];
var _emscripten_bind_b2Profile_set_solveTOI_1 = Module["_emscripten_bind_b2Profile_set_solveTOI_1"] = asm["_emscripten_bind_b2Profile_set_solveTOI_1"];
var _emscripten_bind_b2PrismaticJointDef_set_type_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_type_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_type_1"];
var _emscripten_bind_b2AABB_GetCenter_0 = Module["_emscripten_bind_b2AABB_GetCenter_0"] = asm["_emscripten_bind_b2AABB_GetCenter_0"];
var _emscripten_bind_b2WheelJoint_SetSpringFrequencyHz_1 = Module["_emscripten_bind_b2WheelJoint_SetSpringFrequencyHz_1"] = asm["_emscripten_bind_b2WheelJoint_SetSpringFrequencyHz_1"];
var _emscripten_bind_b2FrictionJointDef___destroy___0 = Module["_emscripten_bind_b2FrictionJointDef___destroy___0"] = asm["_emscripten_bind_b2FrictionJointDef___destroy___0"];
var _emscripten_bind_b2PrismaticJoint_GetReactionForce_1 = Module["_emscripten_bind_b2PrismaticJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2PrismaticJoint_GetReactionForce_1"];
var _emscripten_bind_b2Transform_b2Transform_0 = Module["_emscripten_bind_b2Transform_b2Transform_0"] = asm["_emscripten_bind_b2Transform_b2Transform_0"];
var _emscripten_enum_b2LimitState_e_equalLimits = Module["_emscripten_enum_b2LimitState_e_equalLimits"] = asm["_emscripten_enum_b2LimitState_e_equalLimits"];
var _emscripten_bind_b2ManifoldPoint_set_normalImpulse_1 = Module["_emscripten_bind_b2ManifoldPoint_set_normalImpulse_1"] = asm["_emscripten_bind_b2ManifoldPoint_set_normalImpulse_1"];
var _emscripten_bind_b2Body_IsFixedRotation_0 = Module["_emscripten_bind_b2Body_IsFixedRotation_0"] = asm["_emscripten_bind_b2Body_IsFixedRotation_0"];
var _emscripten_enum_b2DrawFlag_e_shapeBit = Module["_emscripten_enum_b2DrawFlag_e_shapeBit"] = asm["_emscripten_enum_b2DrawFlag_e_shapeBit"];
var _emscripten_bind_b2Contact_GetFriction_0 = Module["_emscripten_bind_b2Contact_GetFriction_0"] = asm["_emscripten_bind_b2Contact_GetFriction_0"];
var _emscripten_bind_b2Body_GetContactList_0 = Module["_emscripten_bind_b2Body_GetContactList_0"] = asm["_emscripten_bind_b2Body_GetContactList_0"];
var _emscripten_bind_b2DistanceJointDef_set_length_1 = Module["_emscripten_bind_b2DistanceJointDef_set_length_1"] = asm["_emscripten_bind_b2DistanceJointDef_set_length_1"];
var _emscripten_bind_b2DistanceJoint_GetLocalAnchorB_0 = Module["_emscripten_bind_b2DistanceJoint_GetLocalAnchorB_0"] = asm["_emscripten_bind_b2DistanceJoint_GetLocalAnchorB_0"];
var _emscripten_bind_b2FrictionJoint_GetLocalAnchorB_0 = Module["_emscripten_bind_b2FrictionJoint_GetLocalAnchorB_0"] = asm["_emscripten_bind_b2FrictionJoint_GetLocalAnchorB_0"];
var _emscripten_bind_b2World_b2World_1 = Module["_emscripten_bind_b2World_b2World_1"] = asm["_emscripten_bind_b2World_b2World_1"];
var _emscripten_bind_b2DistanceJointDef_get_type_0 = Module["_emscripten_bind_b2DistanceJointDef_get_type_0"] = asm["_emscripten_bind_b2DistanceJointDef_get_type_0"];
var _emscripten_bind_b2Draw_ClearFlags_1 = Module["_emscripten_bind_b2Draw_ClearFlags_1"] = asm["_emscripten_bind_b2Draw_ClearFlags_1"];
var _emscripten_bind_b2Body_SetAngularDamping_1 = Module["_emscripten_bind_b2Body_SetAngularDamping_1"] = asm["_emscripten_bind_b2Body_SetAngularDamping_1"];
var _emscripten_bind_b2Body_IsActive_0 = Module["_emscripten_bind_b2Body_IsActive_0"] = asm["_emscripten_bind_b2Body_IsActive_0"];
var _emscripten_bind_b2Contact_ResetRestitution_0 = Module["_emscripten_bind_b2Contact_ResetRestitution_0"] = asm["_emscripten_bind_b2Contact_ResetRestitution_0"];
var _emscripten_bind_b2World_GetAllowSleeping_0 = Module["_emscripten_bind_b2World_GetAllowSleeping_0"] = asm["_emscripten_bind_b2World_GetAllowSleeping_0"];
var _emscripten_bind_b2ManifoldPoint_b2ManifoldPoint_0 = Module["_emscripten_bind_b2ManifoldPoint_b2ManifoldPoint_0"] = asm["_emscripten_bind_b2ManifoldPoint_b2ManifoldPoint_0"];
var _emscripten_bind_b2EdgeShape_set_m_type_1 = Module["_emscripten_bind_b2EdgeShape_set_m_type_1"] = asm["_emscripten_bind_b2EdgeShape_set_m_type_1"];
var _emscripten_enum_b2JointType_e_unknownJoint = Module["_emscripten_enum_b2JointType_e_unknownJoint"] = asm["_emscripten_enum_b2JointType_e_unknownJoint"];
var _emscripten_bind_b2RevoluteJointDef_set_enableMotor_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_enableMotor_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_enableMotor_1"];
var _emscripten_bind_b2PulleyJoint_IsActive_0 = Module["_emscripten_bind_b2PulleyJoint_IsActive_0"] = asm["_emscripten_bind_b2PulleyJoint_IsActive_0"];
var _emscripten_bind_b2MouseJoint_GetNext_0 = Module["_emscripten_bind_b2MouseJoint_GetNext_0"] = asm["_emscripten_bind_b2MouseJoint_GetNext_0"];
var _emscripten_bind_b2RevoluteJoint_SetUserData_1 = Module["_emscripten_bind_b2RevoluteJoint_SetUserData_1"] = asm["_emscripten_bind_b2RevoluteJoint_SetUserData_1"];
var _emscripten_bind_b2Manifold_get_localPoint_0 = Module["_emscripten_bind_b2Manifold_get_localPoint_0"] = asm["_emscripten_bind_b2Manifold_get_localPoint_0"];
var _emscripten_bind_b2PulleyJointDef_get_lengthB_0 = Module["_emscripten_bind_b2PulleyJointDef_get_lengthB_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_lengthB_0"];
var _emscripten_bind_b2WeldJoint_SetUserData_1 = Module["_emscripten_bind_b2WeldJoint_SetUserData_1"] = asm["_emscripten_bind_b2WeldJoint_SetUserData_1"];
var _emscripten_bind_b2ChainShape_CreateLoop_2 = Module["_emscripten_bind_b2ChainShape_CreateLoop_2"] = asm["_emscripten_bind_b2ChainShape_CreateLoop_2"];
var _emscripten_bind_b2GearJointDef_get_joint1_0 = Module["_emscripten_bind_b2GearJointDef_get_joint1_0"] = asm["_emscripten_bind_b2GearJointDef_get_joint1_0"];
var _emscripten_bind_b2PrismaticJoint_GetMotorForce_1 = Module["_emscripten_bind_b2PrismaticJoint_GetMotorForce_1"] = asm["_emscripten_bind_b2PrismaticJoint_GetMotorForce_1"];
var _emscripten_bind_b2Body_SetUserData_1 = Module["_emscripten_bind_b2Body_SetUserData_1"] = asm["_emscripten_bind_b2Body_SetUserData_1"];
var _emscripten_bind_b2GearJoint_IsActive_0 = Module["_emscripten_bind_b2GearJoint_IsActive_0"] = asm["_emscripten_bind_b2GearJoint_IsActive_0"];
var _emscripten_bind_b2EdgeShape_get_m_vertex0_0 = Module["_emscripten_bind_b2EdgeShape_get_m_vertex0_0"] = asm["_emscripten_bind_b2EdgeShape_get_m_vertex0_0"];
var _emscripten_enum_b2JointType_e_revoluteJoint = Module["_emscripten_enum_b2JointType_e_revoluteJoint"] = asm["_emscripten_enum_b2JointType_e_revoluteJoint"];
var _emscripten_bind_b2Vec2_get_x_0 = Module["_emscripten_bind_b2Vec2_get_x_0"] = asm["_emscripten_bind_b2Vec2_get_x_0"];
var _emscripten_bind_b2WeldJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2WeldJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2WeldJointDef_get_collideConnected_0"];
var _emscripten_bind_b2FrictionJoint_GetMaxTorque_0 = Module["_emscripten_bind_b2FrictionJoint_GetMaxTorque_0"] = asm["_emscripten_bind_b2FrictionJoint_GetMaxTorque_0"];
var _emscripten_bind_b2EdgeShape_RayCast_4 = Module["_emscripten_bind_b2EdgeShape_RayCast_4"] = asm["_emscripten_bind_b2EdgeShape_RayCast_4"];
var _emscripten_bind_b2BodyDef_set_allowSleep_1 = Module["_emscripten_bind_b2BodyDef_set_allowSleep_1"] = asm["_emscripten_bind_b2BodyDef_set_allowSleep_1"];
var _emscripten_bind_b2PulleyJoint_GetType_0 = Module["_emscripten_bind_b2PulleyJoint_GetType_0"] = asm["_emscripten_bind_b2PulleyJoint_GetType_0"];
var _emscripten_bind_b2WeldJointDef_set_localAnchorA_1 = Module["_emscripten_bind_b2WeldJointDef_set_localAnchorA_1"] = asm["_emscripten_bind_b2WeldJointDef_set_localAnchorA_1"];
var _emscripten_bind_b2Profile_set_step_1 = Module["_emscripten_bind_b2Profile_set_step_1"] = asm["_emscripten_bind_b2Profile_set_step_1"];
var _emscripten_bind_b2ContactEdge_set_other_1 = Module["_emscripten_bind_b2ContactEdge_set_other_1"] = asm["_emscripten_bind_b2ContactEdge_set_other_1"];
var _emscripten_bind_b2PulleyJoint_GetCurrentLengthB_0 = Module["_emscripten_bind_b2PulleyJoint_GetCurrentLengthB_0"] = asm["_emscripten_bind_b2PulleyJoint_GetCurrentLengthB_0"];
var _emscripten_bind_b2Vec2_op_mul_1 = Module["_emscripten_bind_b2Vec2_op_mul_1"] = asm["_emscripten_bind_b2Vec2_op_mul_1"];
var _emscripten_bind_b2PrismaticJointDef_get_localAnchorA_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_localAnchorA_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_localAnchorA_0"];
var _emscripten_bind_b2EdgeShape___destroy___0 = Module["_emscripten_bind_b2EdgeShape___destroy___0"] = asm["_emscripten_bind_b2EdgeShape___destroy___0"];
var _emscripten_bind_b2PolygonShape_get_m_count_0 = Module["_emscripten_bind_b2PolygonShape_get_m_count_0"] = asm["_emscripten_bind_b2PolygonShape_get_m_count_0"];
var _emscripten_bind_b2RopeJoint_GetAnchorA_0 = Module["_emscripten_bind_b2RopeJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2RopeJoint_GetAnchorA_0"];
var _emscripten_bind_b2DistanceJointDef_get_bodyA_0 = Module["_emscripten_bind_b2DistanceJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2DistanceJointDef_get_bodyA_0"];
var _emscripten_bind_b2AABB_Combine_2 = Module["_emscripten_bind_b2AABB_Combine_2"] = asm["_emscripten_bind_b2AABB_Combine_2"];
var _emscripten_bind_b2ManifoldPoint_set_tangentImpulse_1 = Module["_emscripten_bind_b2ManifoldPoint_set_tangentImpulse_1"] = asm["_emscripten_bind_b2ManifoldPoint_set_tangentImpulse_1"];
var _emscripten_bind_b2BodyDef_get_allowSleep_0 = Module["_emscripten_bind_b2BodyDef_get_allowSleep_0"] = asm["_emscripten_bind_b2BodyDef_get_allowSleep_0"];
var _emscripten_bind_b2ContactEdge_get_other_0 = Module["_emscripten_bind_b2ContactEdge_get_other_0"] = asm["_emscripten_bind_b2ContactEdge_get_other_0"];
var _emscripten_bind_b2RopeJoint_GetLocalAnchorB_0 = Module["_emscripten_bind_b2RopeJoint_GetLocalAnchorB_0"] = asm["_emscripten_bind_b2RopeJoint_GetLocalAnchorB_0"];
var _emscripten_bind_b2PulleyJointDef___destroy___0 = Module["_emscripten_bind_b2PulleyJointDef___destroy___0"] = asm["_emscripten_bind_b2PulleyJointDef___destroy___0"];
var _emscripten_bind_b2MouseJoint_GetBodyB_0 = Module["_emscripten_bind_b2MouseJoint_GetBodyB_0"] = asm["_emscripten_bind_b2MouseJoint_GetBodyB_0"];
var _emscripten_bind_b2PolygonShape_TestPoint_2 = Module["_emscripten_bind_b2PolygonShape_TestPoint_2"] = asm["_emscripten_bind_b2PolygonShape_TestPoint_2"];
var _emscripten_bind_b2JointEdge_get_other_0 = Module["_emscripten_bind_b2JointEdge_get_other_0"] = asm["_emscripten_bind_b2JointEdge_get_other_0"];
var _emscripten_bind_b2PolygonShape_b2PolygonShape_0 = Module["_emscripten_bind_b2PolygonShape_b2PolygonShape_0"] = asm["_emscripten_bind_b2PolygonShape_b2PolygonShape_0"];
var _emscripten_bind_b2PolygonShape_Set_2 = Module["_emscripten_bind_b2PolygonShape_Set_2"] = asm["_emscripten_bind_b2PolygonShape_Set_2"];
var _emscripten_bind_b2GearJoint_GetReactionForce_1 = Module["_emscripten_bind_b2GearJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2GearJoint_GetReactionForce_1"];
var _emscripten_bind_b2DistanceJointDef_get_localAnchorA_0 = Module["_emscripten_bind_b2DistanceJointDef_get_localAnchorA_0"] = asm["_emscripten_bind_b2DistanceJointDef_get_localAnchorA_0"];
var _emscripten_bind_b2Fixture_SetUserData_1 = Module["_emscripten_bind_b2Fixture_SetUserData_1"] = asm["_emscripten_bind_b2Fixture_SetUserData_1"];
var _emscripten_bind_b2Contact_SetTangentSpeed_1 = Module["_emscripten_bind_b2Contact_SetTangentSpeed_1"] = asm["_emscripten_bind_b2Contact_SetTangentSpeed_1"];
var _emscripten_bind_b2PrismaticJointDef_b2PrismaticJointDef_0 = Module["_emscripten_bind_b2PrismaticJointDef_b2PrismaticJointDef_0"] = asm["_emscripten_bind_b2PrismaticJointDef_b2PrismaticJointDef_0"];
var _emscripten_bind_b2BodyDef_get_active_0 = Module["_emscripten_bind_b2BodyDef_get_active_0"] = asm["_emscripten_bind_b2BodyDef_get_active_0"];
var _emscripten_bind_b2Body_GetAngularVelocity_0 = Module["_emscripten_bind_b2Body_GetAngularVelocity_0"] = asm["_emscripten_bind_b2Body_GetAngularVelocity_0"];
var _emscripten_bind_b2CircleShape_set_m_p_1 = Module["_emscripten_bind_b2CircleShape_set_m_p_1"] = asm["_emscripten_bind_b2CircleShape_set_m_p_1"];
var _emscripten_bind_b2Draw___destroy___0 = Module["_emscripten_bind_b2Draw___destroy___0"] = asm["_emscripten_bind_b2Draw___destroy___0"];
var _emscripten_bind_b2WheelJointDef_Initialize_4 = Module["_emscripten_bind_b2WheelJointDef_Initialize_4"] = asm["_emscripten_bind_b2WheelJointDef_Initialize_4"];
var _emscripten_bind_b2WeldJointDef_set_dampingRatio_1 = Module["_emscripten_bind_b2WeldJointDef_set_dampingRatio_1"] = asm["_emscripten_bind_b2WeldJointDef_set_dampingRatio_1"];
var _emscripten_bind_b2ChainShape_b2ChainShape_0 = Module["_emscripten_bind_b2ChainShape_b2ChainShape_0"] = asm["_emscripten_bind_b2ChainShape_b2ChainShape_0"];
var _emscripten_bind_b2Joint_GetAnchorB_0 = Module["_emscripten_bind_b2Joint_GetAnchorB_0"] = asm["_emscripten_bind_b2Joint_GetAnchorB_0"];
var _emscripten_bind_b2PrismaticJointDef_get_userData_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_userData_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_userData_0"];
var _emscripten_bind_b2MotorJoint_GetMaxForce_0 = Module["_emscripten_bind_b2MotorJoint_GetMaxForce_0"] = asm["_emscripten_bind_b2MotorJoint_GetMaxForce_0"];
var _emscripten_bind_b2RevoluteJoint_GetBodyA_0 = Module["_emscripten_bind_b2RevoluteJoint_GetBodyA_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetBodyA_0"];
var _emscripten_bind_b2ContactID_set_cf_1 = Module["_emscripten_bind_b2ContactID_set_cf_1"] = asm["_emscripten_bind_b2ContactID_set_cf_1"];
var _emscripten_bind_b2Body_GetGravityScale_0 = Module["_emscripten_bind_b2Body_GetGravityScale_0"] = asm["_emscripten_bind_b2Body_GetGravityScale_0"];
var _emscripten_bind_b2Vec3_Set_3 = Module["_emscripten_bind_b2Vec3_Set_3"] = asm["_emscripten_bind_b2Vec3_Set_3"];
var _emscripten_bind_b2RevoluteJointDef_set_localAnchorA_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_localAnchorA_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_localAnchorA_1"];
var _emscripten_bind_b2FrictionJointDef_set_localAnchorB_1 = Module["_emscripten_bind_b2FrictionJointDef_set_localAnchorB_1"] = asm["_emscripten_bind_b2FrictionJointDef_set_localAnchorB_1"];
var _emscripten_bind_b2PulleyJoint_GetNext_0 = Module["_emscripten_bind_b2PulleyJoint_GetNext_0"] = asm["_emscripten_bind_b2PulleyJoint_GetNext_0"];
var _emscripten_bind_b2ChainShape_get_m_type_0 = Module["_emscripten_bind_b2ChainShape_get_m_type_0"] = asm["_emscripten_bind_b2ChainShape_get_m_type_0"];
var _emscripten_bind_b2PulleyJointDef_get_groundAnchorB_0 = Module["_emscripten_bind_b2PulleyJointDef_get_groundAnchorB_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_groundAnchorB_0"];
var _emscripten_bind_JSDraw_DrawTransform_1 = Module["_emscripten_bind_JSDraw_DrawTransform_1"] = asm["_emscripten_bind_JSDraw_DrawTransform_1"];
var _emscripten_bind_b2GearJointDef_get_bodyA_0 = Module["_emscripten_bind_b2GearJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2GearJointDef_get_bodyA_0"];
var _emscripten_bind_b2DistanceJointDef_set_frequencyHz_1 = Module["_emscripten_bind_b2DistanceJointDef_set_frequencyHz_1"] = asm["_emscripten_bind_b2DistanceJointDef_set_frequencyHz_1"];
var _emscripten_bind_b2RevoluteJointDef_get_localAnchorB_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_localAnchorB_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_localAnchorB_0"];
var _emscripten_bind_b2RevoluteJointDef_get_referenceAngle_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_referenceAngle_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_referenceAngle_0"];
var _emscripten_bind_JSContactFilter___destroy___0 = Module["_emscripten_bind_JSContactFilter___destroy___0"] = asm["_emscripten_bind_JSContactFilter___destroy___0"];
var _emscripten_bind_b2RevoluteJointDef_get_enableMotor_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_enableMotor_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_enableMotor_0"];
var _memset = Module["_memset"] = asm["_memset"];
var _emscripten_bind_b2PolygonShape_get_m_radius_0 = Module["_emscripten_bind_b2PolygonShape_get_m_radius_0"] = asm["_emscripten_bind_b2PolygonShape_get_m_radius_0"];
var _emscripten_enum_b2BodyType_b2_kinematicBody = Module["_emscripten_enum_b2BodyType_b2_kinematicBody"] = asm["_emscripten_enum_b2BodyType_b2_kinematicBody"];
var _emscripten_bind_b2Rot_set_s_1 = Module["_emscripten_bind_b2Rot_set_s_1"] = asm["_emscripten_bind_b2Rot_set_s_1"];
var _emscripten_enum_b2ManifoldType_e_faceA = Module["_emscripten_enum_b2ManifoldType_e_faceA"] = asm["_emscripten_enum_b2ManifoldType_e_faceA"];
var _emscripten_enum_b2ManifoldType_e_faceB = Module["_emscripten_enum_b2ManifoldType_e_faceB"] = asm["_emscripten_enum_b2ManifoldType_e_faceB"];
var _emscripten_bind_b2RevoluteJointDef_get_bodyB_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_bodyB_0"];
var _emscripten_bind_b2FixtureDef_b2FixtureDef_0 = Module["_emscripten_bind_b2FixtureDef_b2FixtureDef_0"] = asm["_emscripten_bind_b2FixtureDef_b2FixtureDef_0"];
var _emscripten_bind_b2PrismaticJoint_SetUserData_1 = Module["_emscripten_bind_b2PrismaticJoint_SetUserData_1"] = asm["_emscripten_bind_b2PrismaticJoint_SetUserData_1"];
var _emscripten_bind_b2EdgeShape_get_m_hasVertex3_0 = Module["_emscripten_bind_b2EdgeShape_get_m_hasVertex3_0"] = asm["_emscripten_bind_b2EdgeShape_get_m_hasVertex3_0"];
var _emscripten_enum_b2ShapeType_e_edge = Module["_emscripten_enum_b2ShapeType_e_edge"] = asm["_emscripten_enum_b2ShapeType_e_edge"];
var _emscripten_bind_b2RevoluteJoint_GetMaxMotorTorque_0 = Module["_emscripten_bind_b2RevoluteJoint_GetMaxMotorTorque_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetMaxMotorTorque_0"];
var _emscripten_bind_b2BodyDef_set_active_1 = Module["_emscripten_bind_b2BodyDef_set_active_1"] = asm["_emscripten_bind_b2BodyDef_set_active_1"];
var _emscripten_bind_b2EdgeShape_Set_2 = Module["_emscripten_bind_b2EdgeShape_Set_2"] = asm["_emscripten_bind_b2EdgeShape_Set_2"];
var _emscripten_bind_b2FixtureDef_set_isSensor_1 = Module["_emscripten_bind_b2FixtureDef_set_isSensor_1"] = asm["_emscripten_bind_b2FixtureDef_set_isSensor_1"];
var _emscripten_bind_b2Body_GetWorldPoint_1 = Module["_emscripten_bind_b2Body_GetWorldPoint_1"] = asm["_emscripten_bind_b2Body_GetWorldPoint_1"];
var _emscripten_bind_b2ManifoldPoint_get_normalImpulse_0 = Module["_emscripten_bind_b2ManifoldPoint_get_normalImpulse_0"] = asm["_emscripten_bind_b2ManifoldPoint_get_normalImpulse_0"];
var _emscripten_bind_JSContactFilter_ShouldCollide_2 = Module["_emscripten_bind_JSContactFilter_ShouldCollide_2"] = asm["_emscripten_bind_JSContactFilter_ShouldCollide_2"];
var _emscripten_bind_b2Joint_GetReactionTorque_1 = Module["_emscripten_bind_b2Joint_GetReactionTorque_1"] = asm["_emscripten_bind_b2Joint_GetReactionTorque_1"];
var _emscripten_bind_b2RevoluteJointDef_set_type_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_type_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_type_1"];
var _emscripten_bind_b2RayCastInput_set_p1_1 = Module["_emscripten_bind_b2RayCastInput_set_p1_1"] = asm["_emscripten_bind_b2RayCastInput_set_p1_1"];
var _emscripten_bind_b2RopeJointDef_b2RopeJointDef_0 = Module["_emscripten_bind_b2RopeJointDef_b2RopeJointDef_0"] = asm["_emscripten_bind_b2RopeJointDef_b2RopeJointDef_0"];
var _emscripten_bind_b2BodyDef_get_linearDamping_0 = Module["_emscripten_bind_b2BodyDef_get_linearDamping_0"] = asm["_emscripten_bind_b2BodyDef_get_linearDamping_0"];
var _emscripten_bind_b2World_Step_3 = Module["_emscripten_bind_b2World_Step_3"] = asm["_emscripten_bind_b2World_Step_3"];
var _emscripten_bind_b2CircleShape_RayCast_4 = Module["_emscripten_bind_b2CircleShape_RayCast_4"] = asm["_emscripten_bind_b2CircleShape_RayCast_4"];
var _emscripten_bind_b2Profile_get_step_0 = Module["_emscripten_bind_b2Profile_get_step_0"] = asm["_emscripten_bind_b2Profile_get_step_0"];
var _emscripten_bind_b2AABB_RayCast_2 = Module["_emscripten_bind_b2AABB_RayCast_2"] = asm["_emscripten_bind_b2AABB_RayCast_2"];
var _emscripten_bind_b2Mat22_SetZero_0 = Module["_emscripten_bind_b2Mat22_SetZero_0"] = asm["_emscripten_bind_b2Mat22_SetZero_0"];
var _emscripten_bind_b2DistanceJoint_GetLength_0 = Module["_emscripten_bind_b2DistanceJoint_GetLength_0"] = asm["_emscripten_bind_b2DistanceJoint_GetLength_0"];
var _emscripten_bind_b2PulleyJoint_GetLengthB_0 = Module["_emscripten_bind_b2PulleyJoint_GetLengthB_0"] = asm["_emscripten_bind_b2PulleyJoint_GetLengthB_0"];
var _emscripten_bind_b2PrismaticJoint_GetUpperLimit_0 = Module["_emscripten_bind_b2PrismaticJoint_GetUpperLimit_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetUpperLimit_0"];
var _emscripten_bind_b2WheelJoint_SetMaxMotorTorque_1 = Module["_emscripten_bind_b2WheelJoint_SetMaxMotorTorque_1"] = asm["_emscripten_bind_b2WheelJoint_SetMaxMotorTorque_1"];
var _emscripten_bind_b2MotorJoint_GetUserData_0 = Module["_emscripten_bind_b2MotorJoint_GetUserData_0"] = asm["_emscripten_bind_b2MotorJoint_GetUserData_0"];
var _emscripten_bind_b2FrictionJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2FrictionJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2FrictionJoint_GetReactionTorque_1"];
var _emscripten_bind_b2Shape_get_m_type_0 = Module["_emscripten_bind_b2Shape_get_m_type_0"] = asm["_emscripten_bind_b2Shape_get_m_type_0"];
var _emscripten_bind_b2MouseJoint_SetDampingRatio_1 = Module["_emscripten_bind_b2MouseJoint_SetDampingRatio_1"] = asm["_emscripten_bind_b2MouseJoint_SetDampingRatio_1"];
var _emscripten_bind_b2World_GetAutoClearForces_0 = Module["_emscripten_bind_b2World_GetAutoClearForces_0"] = asm["_emscripten_bind_b2World_GetAutoClearForces_0"];
var _emscripten_enum_b2ShapeType_e_circle = Module["_emscripten_enum_b2ShapeType_e_circle"] = asm["_emscripten_enum_b2ShapeType_e_circle"];
var _emscripten_bind_b2BodyDef_set_fixedRotation_1 = Module["_emscripten_bind_b2BodyDef_set_fixedRotation_1"] = asm["_emscripten_bind_b2BodyDef_set_fixedRotation_1"];
var _emscripten_bind_b2Vec2_b2Vec2_2 = Module["_emscripten_bind_b2Vec2_b2Vec2_2"] = asm["_emscripten_bind_b2Vec2_b2Vec2_2"];
var _emscripten_bind_b2Manifold_get_type_0 = Module["_emscripten_bind_b2Manifold_get_type_0"] = asm["_emscripten_bind_b2Manifold_get_type_0"];
var _emscripten_bind_b2Body_Dump_0 = Module["_emscripten_bind_b2Body_Dump_0"] = asm["_emscripten_bind_b2Body_Dump_0"];
var _emscripten_bind_b2RevoluteJoint_GetLowerLimit_0 = Module["_emscripten_bind_b2RevoluteJoint_GetLowerLimit_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetLowerLimit_0"];
var _emscripten_bind_b2Body_GetWorldCenter_0 = Module["_emscripten_bind_b2Body_GetWorldCenter_0"] = asm["_emscripten_bind_b2Body_GetWorldCenter_0"];
var _emscripten_bind_b2WheelJointDef_set_maxMotorTorque_1 = Module["_emscripten_bind_b2WheelJointDef_set_maxMotorTorque_1"] = asm["_emscripten_bind_b2WheelJointDef_set_maxMotorTorque_1"];
var _emscripten_bind_b2BodyDef_set_linearVelocity_1 = Module["_emscripten_bind_b2BodyDef_set_linearVelocity_1"] = asm["_emscripten_bind_b2BodyDef_set_linearVelocity_1"];
var _emscripten_bind_b2JointDef_set_collideConnected_1 = Module["_emscripten_bind_b2JointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2JointDef_set_collideConnected_1"];
var _emscripten_bind_b2MotorJoint___destroy___0 = Module["_emscripten_bind_b2MotorJoint___destroy___0"] = asm["_emscripten_bind_b2MotorJoint___destroy___0"];
var _emscripten_bind_b2Body_GetUserData_0 = Module["_emscripten_bind_b2Body_GetUserData_0"] = asm["_emscripten_bind_b2Body_GetUserData_0"];
var _emscripten_bind_b2Body_GetAngularDamping_0 = Module["_emscripten_bind_b2Body_GetAngularDamping_0"] = asm["_emscripten_bind_b2Body_GetAngularDamping_0"];
var _emscripten_bind_b2Fixture_RayCast_3 = Module["_emscripten_bind_b2Fixture_RayCast_3"] = asm["_emscripten_bind_b2Fixture_RayCast_3"];
var _emscripten_bind_b2JointDef_set_bodyA_1 = Module["_emscripten_bind_b2JointDef_set_bodyA_1"] = asm["_emscripten_bind_b2JointDef_set_bodyA_1"];
var _emscripten_bind_b2GearJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2GearJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2GearJointDef_get_collideConnected_0"];
var _emscripten_bind_b2RopeJointDef_get_maxLength_0 = Module["_emscripten_bind_b2RopeJointDef_get_maxLength_0"] = asm["_emscripten_bind_b2RopeJointDef_get_maxLength_0"];
var _emscripten_bind_b2MouseJointDef_get_bodyA_0 = Module["_emscripten_bind_b2MouseJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2MouseJointDef_get_bodyA_0"];
var _emscripten_bind_b2Body_SetBullet_1 = Module["_emscripten_bind_b2Body_SetBullet_1"] = asm["_emscripten_bind_b2Body_SetBullet_1"];
var _emscripten_bind_b2DistanceJoint_GetType_0 = Module["_emscripten_bind_b2DistanceJoint_GetType_0"] = asm["_emscripten_bind_b2DistanceJoint_GetType_0"];
var _emscripten_bind_b2FixtureDef_get_restitution_0 = Module["_emscripten_bind_b2FixtureDef_get_restitution_0"] = asm["_emscripten_bind_b2FixtureDef_get_restitution_0"];
var _emscripten_bind_b2Fixture_GetType_0 = Module["_emscripten_bind_b2Fixture_GetType_0"] = asm["_emscripten_bind_b2Fixture_GetType_0"];
var _emscripten_bind_b2WheelJointDef_set_enableMotor_1 = Module["_emscripten_bind_b2WheelJointDef_set_enableMotor_1"] = asm["_emscripten_bind_b2WheelJointDef_set_enableMotor_1"];
var _emscripten_bind_b2RevoluteJoint_GetBodyB_0 = Module["_emscripten_bind_b2RevoluteJoint_GetBodyB_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetBodyB_0"];
var _emscripten_bind_b2Profile_set_solveInit_1 = Module["_emscripten_bind_b2Profile_set_solveInit_1"] = asm["_emscripten_bind_b2Profile_set_solveInit_1"];
var _emscripten_bind_b2RopeJointDef_set_type_1 = Module["_emscripten_bind_b2RopeJointDef_set_type_1"] = asm["_emscripten_bind_b2RopeJointDef_set_type_1"];
var _emscripten_bind_b2PrismaticJointDef_get_bodyB_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_bodyB_0"];
var _emscripten_bind_b2GearJoint_GetJoint2_0 = Module["_emscripten_bind_b2GearJoint_GetJoint2_0"] = asm["_emscripten_bind_b2GearJoint_GetJoint2_0"];
var _emscripten_bind_b2PulleyJointDef_get_userData_0 = Module["_emscripten_bind_b2PulleyJointDef_get_userData_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_userData_0"];
var _emscripten_bind_b2PrismaticJointDef_set_bodyB_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_bodyB_1"];
var _emscripten_bind_b2FrictionJointDef_b2FrictionJointDef_0 = Module["_emscripten_bind_b2FrictionJointDef_b2FrictionJointDef_0"] = asm["_emscripten_bind_b2FrictionJointDef_b2FrictionJointDef_0"];
var _emscripten_bind_b2PulleyJoint_GetCurrentLengthA_0 = Module["_emscripten_bind_b2PulleyJoint_GetCurrentLengthA_0"] = asm["_emscripten_bind_b2PulleyJoint_GetCurrentLengthA_0"];
var _emscripten_bind_b2Manifold_get_localNormal_0 = Module["_emscripten_bind_b2Manifold_get_localNormal_0"] = asm["_emscripten_bind_b2Manifold_get_localNormal_0"];
var _emscripten_bind_b2Vec3_b2Vec3_0 = Module["_emscripten_bind_b2Vec3_b2Vec3_0"] = asm["_emscripten_bind_b2Vec3_b2Vec3_0"];
var _emscripten_bind_b2Body_SetSleepingAllowed_1 = Module["_emscripten_bind_b2Body_SetSleepingAllowed_1"] = asm["_emscripten_bind_b2Body_SetSleepingAllowed_1"];
var _emscripten_bind_b2DistanceJoint___destroy___0 = Module["_emscripten_bind_b2DistanceJoint___destroy___0"] = asm["_emscripten_bind_b2DistanceJoint___destroy___0"];
var _emscripten_bind_b2PrismaticJoint_GetAnchorA_0 = Module["_emscripten_bind_b2PrismaticJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetAnchorA_0"];
var _emscripten_bind_b2Manifold_set_pointCount_1 = Module["_emscripten_bind_b2Manifold_set_pointCount_1"] = asm["_emscripten_bind_b2Manifold_set_pointCount_1"];
var _emscripten_bind_b2PrismaticJoint_IsMotorEnabled_0 = Module["_emscripten_bind_b2PrismaticJoint_IsMotorEnabled_0"] = asm["_emscripten_bind_b2PrismaticJoint_IsMotorEnabled_0"];
var _emscripten_bind_b2WeldJoint_GetFrequency_0 = Module["_emscripten_bind_b2WeldJoint_GetFrequency_0"] = asm["_emscripten_bind_b2WeldJoint_GetFrequency_0"];
var _emscripten_bind_b2Joint_GetUserData_0 = Module["_emscripten_bind_b2Joint_GetUserData_0"] = asm["_emscripten_bind_b2Joint_GetUserData_0"];
var _emscripten_bind_b2RevoluteJointDef_get_lowerAngle_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_lowerAngle_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_lowerAngle_0"];
var _emscripten_bind_b2Manifold_set_type_1 = Module["_emscripten_bind_b2Manifold_set_type_1"] = asm["_emscripten_bind_b2Manifold_set_type_1"];
var _emscripten_bind_b2Vec3_b2Vec3_3 = Module["_emscripten_bind_b2Vec3_b2Vec3_3"] = asm["_emscripten_bind_b2Vec3_b2Vec3_3"];
var _emscripten_bind_b2RopeJointDef_set_maxLength_1 = Module["_emscripten_bind_b2RopeJointDef_set_maxLength_1"] = asm["_emscripten_bind_b2RopeJointDef_set_maxLength_1"];
var _emscripten_bind_b2ChainShape_TestPoint_2 = Module["_emscripten_bind_b2ChainShape_TestPoint_2"] = asm["_emscripten_bind_b2ChainShape_TestPoint_2"];
var _emscripten_bind_b2PrismaticJoint_GetReferenceAngle_0 = Module["_emscripten_bind_b2PrismaticJoint_GetReferenceAngle_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetReferenceAngle_0"];
var _emscripten_bind_b2RayCastInput_get_p2_0 = Module["_emscripten_bind_b2RayCastInput_get_p2_0"] = asm["_emscripten_bind_b2RayCastInput_get_p2_0"];
var _emscripten_bind_b2BodyDef_set_angle_1 = Module["_emscripten_bind_b2BodyDef_set_angle_1"] = asm["_emscripten_bind_b2BodyDef_set_angle_1"];
var _emscripten_bind_b2WeldJoint_GetUserData_0 = Module["_emscripten_bind_b2WeldJoint_GetUserData_0"] = asm["_emscripten_bind_b2WeldJoint_GetUserData_0"];
var _emscripten_bind_b2WheelJointDef_get_localAnchorA_0 = Module["_emscripten_bind_b2WheelJointDef_get_localAnchorA_0"] = asm["_emscripten_bind_b2WheelJointDef_get_localAnchorA_0"];
var _emscripten_bind_b2PulleyJointDef_set_type_1 = Module["_emscripten_bind_b2PulleyJointDef_set_type_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_type_1"];
var _emscripten_bind_b2Body_IsBullet_0 = Module["_emscripten_bind_b2Body_IsBullet_0"] = asm["_emscripten_bind_b2Body_IsBullet_0"];
var _emscripten_bind_b2MotorJointDef_set_bodyA_1 = Module["_emscripten_bind_b2MotorJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2MotorJointDef_set_bodyA_1"];
var _emscripten_bind_b2Fixture_TestPoint_1 = Module["_emscripten_bind_b2Fixture_TestPoint_1"] = asm["_emscripten_bind_b2Fixture_TestPoint_1"];
var _emscripten_bind_b2Mat33_GetSymInverse33_1 = Module["_emscripten_bind_b2Mat33_GetSymInverse33_1"] = asm["_emscripten_bind_b2Mat33_GetSymInverse33_1"];
var _emscripten_bind_JSDraw_DrawPolygon_3 = Module["_emscripten_bind_JSDraw_DrawPolygon_3"] = asm["_emscripten_bind_JSDraw_DrawPolygon_3"];
var _emscripten_bind_b2PolygonShape_ComputeMass_2 = Module["_emscripten_bind_b2PolygonShape_ComputeMass_2"] = asm["_emscripten_bind_b2PolygonShape_ComputeMass_2"];
var _emscripten_bind_b2PrismaticJointDef_set_upperTranslation_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_upperTranslation_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_upperTranslation_1"];
var _emscripten_bind_b2MouseJoint_SetFrequency_1 = Module["_emscripten_bind_b2MouseJoint_SetFrequency_1"] = asm["_emscripten_bind_b2MouseJoint_SetFrequency_1"];
var _emscripten_bind_b2EdgeShape_get_m_vertex1_0 = Module["_emscripten_bind_b2EdgeShape_get_m_vertex1_0"] = asm["_emscripten_bind_b2EdgeShape_get_m_vertex1_0"];
var _emscripten_bind_b2BodyDef_set_awake_1 = Module["_emscripten_bind_b2BodyDef_set_awake_1"] = asm["_emscripten_bind_b2BodyDef_set_awake_1"];
var _emscripten_bind_b2Vec2_get_y_0 = Module["_emscripten_bind_b2Vec2_get_y_0"] = asm["_emscripten_bind_b2Vec2_get_y_0"];
var _emscripten_bind_b2Filter_set_categoryBits_1 = Module["_emscripten_bind_b2Filter_set_categoryBits_1"] = asm["_emscripten_bind_b2Filter_set_categoryBits_1"];
var _emscripten_bind_b2Body_CreateFixture_2 = Module["_emscripten_bind_b2Body_CreateFixture_2"] = asm["_emscripten_bind_b2Body_CreateFixture_2"];
var _emscripten_bind_b2Body_SetActive_1 = Module["_emscripten_bind_b2Body_SetActive_1"] = asm["_emscripten_bind_b2Body_SetActive_1"];
var _emscripten_bind_b2ContactFeature_get_indexB_0 = Module["_emscripten_bind_b2ContactFeature_get_indexB_0"] = asm["_emscripten_bind_b2ContactFeature_get_indexB_0"];
var _emscripten_bind_b2Fixture_GetUserData_0 = Module["_emscripten_bind_b2Fixture_GetUserData_0"] = asm["_emscripten_bind_b2Fixture_GetUserData_0"];
var _emscripten_bind_b2PolygonShape_ComputeAABB_3 = Module["_emscripten_bind_b2PolygonShape_ComputeAABB_3"] = asm["_emscripten_bind_b2PolygonShape_ComputeAABB_3"];
var _emscripten_bind_b2ContactFeature_get_typeA_0 = Module["_emscripten_bind_b2ContactFeature_get_typeA_0"] = asm["_emscripten_bind_b2ContactFeature_get_typeA_0"];
var _emscripten_bind_b2MouseJointDef_set_maxForce_1 = Module["_emscripten_bind_b2MouseJointDef_set_maxForce_1"] = asm["_emscripten_bind_b2MouseJointDef_set_maxForce_1"];
var _emscripten_bind_b2PrismaticJoint_GetLocalAnchorA_0 = Module["_emscripten_bind_b2PrismaticJoint_GetLocalAnchorA_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetLocalAnchorA_0"];
var _emscripten_bind_b2EdgeShape_TestPoint_2 = Module["_emscripten_bind_b2EdgeShape_TestPoint_2"] = asm["_emscripten_bind_b2EdgeShape_TestPoint_2"];
var _emscripten_bind_b2PolygonShape_get_m_centroid_0 = Module["_emscripten_bind_b2PolygonShape_get_m_centroid_0"] = asm["_emscripten_bind_b2PolygonShape_get_m_centroid_0"];
var _emscripten_bind_b2ChainShape___destroy___0 = Module["_emscripten_bind_b2ChainShape___destroy___0"] = asm["_emscripten_bind_b2ChainShape___destroy___0"];
var _emscripten_bind_b2GearJoint_SetUserData_1 = Module["_emscripten_bind_b2GearJoint_SetUserData_1"] = asm["_emscripten_bind_b2GearJoint_SetUserData_1"];
var _emscripten_bind_b2Vec3_set_z_1 = Module["_emscripten_bind_b2Vec3_set_z_1"] = asm["_emscripten_bind_b2Vec3_set_z_1"];
var _emscripten_bind_b2PrismaticJointDef_set_enableLimit_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_enableLimit_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_enableLimit_1"];
var _emscripten_bind_b2DistanceJoint_GetFrequency_0 = Module["_emscripten_bind_b2DistanceJoint_GetFrequency_0"] = asm["_emscripten_bind_b2DistanceJoint_GetFrequency_0"];
var _emscripten_bind_b2PrismaticJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_collideConnected_0"];
var _emscripten_bind_b2Body_SetGravityScale_1 = Module["_emscripten_bind_b2Body_SetGravityScale_1"] = asm["_emscripten_bind_b2Body_SetGravityScale_1"];
var _emscripten_enum_b2ContactFeatureType_e_face = Module["_emscripten_enum_b2ContactFeatureType_e_face"] = asm["_emscripten_enum_b2ContactFeatureType_e_face"];
var _emscripten_bind_b2RevoluteJoint_GetUpperLimit_0 = Module["_emscripten_bind_b2RevoluteJoint_GetUpperLimit_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetUpperLimit_0"];
var _emscripten_bind_b2PulleyJointDef_get_lengthA_0 = Module["_emscripten_bind_b2PulleyJointDef_get_lengthA_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_lengthA_0"];
var _emscripten_bind_b2Vec3_set_x_1 = Module["_emscripten_bind_b2Vec3_set_x_1"] = asm["_emscripten_bind_b2Vec3_set_x_1"];
var _emscripten_bind_b2PulleyJointDef_get_type_0 = Module["_emscripten_bind_b2PulleyJointDef_get_type_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_type_0"];
var _emscripten_bind_JSDestructionListener_SayGoodbyeJoint_1 = Module["_emscripten_bind_JSDestructionListener_SayGoodbyeJoint_1"] = asm["_emscripten_bind_JSDestructionListener_SayGoodbyeJoint_1"];
var _emscripten_bind_b2Shape___destroy___0 = Module["_emscripten_bind_b2Shape___destroy___0"] = asm["_emscripten_bind_b2Shape___destroy___0"];
var _emscripten_bind_b2Joint_GetReactionForce_1 = Module["_emscripten_bind_b2Joint_GetReactionForce_1"] = asm["_emscripten_bind_b2Joint_GetReactionForce_1"];
var _emscripten_bind_b2FixtureDef_set_friction_1 = Module["_emscripten_bind_b2FixtureDef_set_friction_1"] = asm["_emscripten_bind_b2FixtureDef_set_friction_1"];
var _emscripten_bind_b2ContactID___destroy___0 = Module["_emscripten_bind_b2ContactID___destroy___0"] = asm["_emscripten_bind_b2ContactID___destroy___0"];
var _emscripten_bind_b2EdgeShape_get_m_hasVertex0_0 = Module["_emscripten_bind_b2EdgeShape_get_m_hasVertex0_0"] = asm["_emscripten_bind_b2EdgeShape_get_m_hasVertex0_0"];
var _emscripten_bind_b2World_GetBodyCount_0 = Module["_emscripten_bind_b2World_GetBodyCount_0"] = asm["_emscripten_bind_b2World_GetBodyCount_0"];
var _emscripten_bind_b2JointEdge_get_prev_0 = Module["_emscripten_bind_b2JointEdge_get_prev_0"] = asm["_emscripten_bind_b2JointEdge_get_prev_0"];
var _emscripten_bind_b2MotorJointDef_get_linearOffset_0 = Module["_emscripten_bind_b2MotorJointDef_get_linearOffset_0"] = asm["_emscripten_bind_b2MotorJointDef_get_linearOffset_0"];
var _emscripten_bind_b2MotorJointDef_Initialize_2 = Module["_emscripten_bind_b2MotorJointDef_Initialize_2"] = asm["_emscripten_bind_b2MotorJointDef_Initialize_2"];
var _emscripten_bind_b2PrismaticJoint_GetAnchorB_0 = Module["_emscripten_bind_b2PrismaticJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetAnchorB_0"];
var _emscripten_bind_b2Body_SetLinearVelocity_1 = Module["_emscripten_bind_b2Body_SetLinearVelocity_1"] = asm["_emscripten_bind_b2Body_SetLinearVelocity_1"];
var _emscripten_enum_b2BodyType_b2_staticBody = Module["_emscripten_enum_b2BodyType_b2_staticBody"] = asm["_emscripten_enum_b2BodyType_b2_staticBody"];
var _emscripten_bind_b2RevoluteJointDef_set_upperAngle_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_upperAngle_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_upperAngle_1"];
var _emscripten_bind_b2RevoluteJointDef_get_type_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_type_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_type_0"];
var _emscripten_bind_b2GearJointDef_get_type_0 = Module["_emscripten_bind_b2GearJointDef_get_type_0"] = asm["_emscripten_bind_b2GearJointDef_get_type_0"];
var _emscripten_bind_b2ChainShape_GetType_0 = Module["_emscripten_bind_b2ChainShape_GetType_0"] = asm["_emscripten_bind_b2ChainShape_GetType_0"];
var _emscripten_bind_b2RayCastInput_get_maxFraction_0 = Module["_emscripten_bind_b2RayCastInput_get_maxFraction_0"] = asm["_emscripten_bind_b2RayCastInput_get_maxFraction_0"];
var _emscripten_bind_b2GearJoint_GetBodyA_0 = Module["_emscripten_bind_b2GearJoint_GetBodyA_0"] = asm["_emscripten_bind_b2GearJoint_GetBodyA_0"];
var _emscripten_bind_b2Body_GetLocalVector_1 = Module["_emscripten_bind_b2Body_GetLocalVector_1"] = asm["_emscripten_bind_b2Body_GetLocalVector_1"];
var _emscripten_bind_b2PrismaticJoint_EnableLimit_1 = Module["_emscripten_bind_b2PrismaticJoint_EnableLimit_1"] = asm["_emscripten_bind_b2PrismaticJoint_EnableLimit_1"];
var _emscripten_bind_b2FrictionJointDef_get_maxForce_0 = Module["_emscripten_bind_b2FrictionJointDef_get_maxForce_0"] = asm["_emscripten_bind_b2FrictionJointDef_get_maxForce_0"];
var _emscripten_bind_b2BodyDef_set_angularVelocity_1 = Module["_emscripten_bind_b2BodyDef_set_angularVelocity_1"] = asm["_emscripten_bind_b2BodyDef_set_angularVelocity_1"];
var _emscripten_bind_b2Body_SetLinearDamping_1 = Module["_emscripten_bind_b2Body_SetLinearDamping_1"] = asm["_emscripten_bind_b2Body_SetLinearDamping_1"];
var _emscripten_bind_b2WheelJoint_GetBodyB_0 = Module["_emscripten_bind_b2WheelJoint_GetBodyB_0"] = asm["_emscripten_bind_b2WheelJoint_GetBodyB_0"];
var _emscripten_bind_b2GearJointDef_get_joint2_0 = Module["_emscripten_bind_b2GearJointDef_get_joint2_0"] = asm["_emscripten_bind_b2GearJointDef_get_joint2_0"];
var _emscripten_bind_b2PrismaticJoint_IsActive_0 = Module["_emscripten_bind_b2PrismaticJoint_IsActive_0"] = asm["_emscripten_bind_b2PrismaticJoint_IsActive_0"];
var _emscripten_bind_b2Vec3_get_z_0 = Module["_emscripten_bind_b2Vec3_get_z_0"] = asm["_emscripten_bind_b2Vec3_get_z_0"];
var _emscripten_bind_b2Filter_get_categoryBits_0 = Module["_emscripten_bind_b2Filter_get_categoryBits_0"] = asm["_emscripten_bind_b2Filter_get_categoryBits_0"];
var _emscripten_enum_b2JointType_e_weldJoint = Module["_emscripten_enum_b2JointType_e_weldJoint"] = asm["_emscripten_enum_b2JointType_e_weldJoint"];
var _emscripten_bind_b2World_SetContinuousPhysics_1 = Module["_emscripten_bind_b2World_SetContinuousPhysics_1"] = asm["_emscripten_bind_b2World_SetContinuousPhysics_1"];
var _emscripten_bind_b2MouseJointDef_get_target_0 = Module["_emscripten_bind_b2MouseJointDef_get_target_0"] = asm["_emscripten_bind_b2MouseJointDef_get_target_0"];
var _emscripten_bind_b2Body_SetTransform_2 = Module["_emscripten_bind_b2Body_SetTransform_2"] = asm["_emscripten_bind_b2Body_SetTransform_2"];
var _emscripten_bind_b2PulleyJointDef_set_userData_1 = Module["_emscripten_bind_b2PulleyJointDef_set_userData_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_userData_1"];
var _emscripten_bind_b2FrictionJointDef_set_maxForce_1 = Module["_emscripten_bind_b2FrictionJointDef_set_maxForce_1"] = asm["_emscripten_bind_b2FrictionJointDef_set_maxForce_1"];
var _emscripten_bind_b2DistanceJointDef_b2DistanceJointDef_0 = Module["_emscripten_bind_b2DistanceJointDef_b2DistanceJointDef_0"] = asm["_emscripten_bind_b2DistanceJointDef_b2DistanceJointDef_0"];
var _emscripten_bind_b2BodyDef_get_type_0 = Module["_emscripten_bind_b2BodyDef_get_type_0"] = asm["_emscripten_bind_b2BodyDef_get_type_0"];
var _emscripten_bind_b2Mat33_GetInverse22_1 = Module["_emscripten_bind_b2Mat33_GetInverse22_1"] = asm["_emscripten_bind_b2Mat33_GetInverse22_1"];
var _emscripten_bind_b2PulleyJoint_GetAnchorB_0 = Module["_emscripten_bind_b2PulleyJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2PulleyJoint_GetAnchorB_0"];
var _emscripten_bind_b2WheelJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2WheelJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2WheelJoint_GetReactionTorque_1"];
var _emscripten_bind_b2RevoluteJointDef_b2RevoluteJointDef_0 = Module["_emscripten_bind_b2RevoluteJointDef_b2RevoluteJointDef_0"] = asm["_emscripten_bind_b2RevoluteJointDef_b2RevoluteJointDef_0"];
var _emscripten_bind_b2ContactFeature_set_typeA_1 = Module["_emscripten_bind_b2ContactFeature_set_typeA_1"] = asm["_emscripten_bind_b2ContactFeature_set_typeA_1"];
var _emscripten_bind_b2Fixture_Dump_1 = Module["_emscripten_bind_b2Fixture_Dump_1"] = asm["_emscripten_bind_b2Fixture_Dump_1"];
var _emscripten_bind_b2RevoluteJointDef_get_enableLimit_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_enableLimit_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_enableLimit_0"];
var _emscripten_bind_b2Manifold_set_localPoint_1 = Module["_emscripten_bind_b2Manifold_set_localPoint_1"] = asm["_emscripten_bind_b2Manifold_set_localPoint_1"];
var _emscripten_bind_b2JointDef_get_userData_0 = Module["_emscripten_bind_b2JointDef_get_userData_0"] = asm["_emscripten_bind_b2JointDef_get_userData_0"];
var _emscripten_bind_b2BodyDef_set_bullet_1 = Module["_emscripten_bind_b2BodyDef_set_bullet_1"] = asm["_emscripten_bind_b2BodyDef_set_bullet_1"];
var _emscripten_bind_b2RayCastOutput___destroy___0 = Module["_emscripten_bind_b2RayCastOutput___destroy___0"] = asm["_emscripten_bind_b2RayCastOutput___destroy___0"];
var _emscripten_bind_JSContactListener___destroy___0 = Module["_emscripten_bind_JSContactListener___destroy___0"] = asm["_emscripten_bind_JSContactListener___destroy___0"];
var _emscripten_bind_b2World_DrawDebugData_0 = Module["_emscripten_bind_b2World_DrawDebugData_0"] = asm["_emscripten_bind_b2World_DrawDebugData_0"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var _emscripten_bind_b2RopeJointDef_get_localAnchorA_0 = Module["_emscripten_bind_b2RopeJointDef_get_localAnchorA_0"] = asm["_emscripten_bind_b2RopeJointDef_get_localAnchorA_0"];
var _emscripten_bind_b2Profile_set_solveVelocity_1 = Module["_emscripten_bind_b2Profile_set_solveVelocity_1"] = asm["_emscripten_bind_b2Profile_set_solveVelocity_1"];
var _emscripten_bind_b2GearJointDef_get_userData_0 = Module["_emscripten_bind_b2GearJointDef_get_userData_0"] = asm["_emscripten_bind_b2GearJointDef_get_userData_0"];
var _emscripten_bind_b2Filter_set_groupIndex_1 = Module["_emscripten_bind_b2Filter_set_groupIndex_1"] = asm["_emscripten_bind_b2Filter_set_groupIndex_1"];
var _emscripten_bind_b2JointDef_b2JointDef_0 = Module["_emscripten_bind_b2JointDef_b2JointDef_0"] = asm["_emscripten_bind_b2JointDef_b2JointDef_0"];
var _emscripten_bind_b2Rot_set_c_1 = Module["_emscripten_bind_b2Rot_set_c_1"] = asm["_emscripten_bind_b2Rot_set_c_1"];
var _emscripten_bind_b2GearJointDef_b2GearJointDef_0 = Module["_emscripten_bind_b2GearJointDef_b2GearJointDef_0"] = asm["_emscripten_bind_b2GearJointDef_b2GearJointDef_0"];
var _emscripten_bind_b2JointDef_get_bodyB_0 = Module["_emscripten_bind_b2JointDef_get_bodyB_0"] = asm["_emscripten_bind_b2JointDef_get_bodyB_0"];
var _emscripten_bind_b2DistanceJoint_GetReactionForce_1 = Module["_emscripten_bind_b2DistanceJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2DistanceJoint_GetReactionForce_1"];
var _emscripten_bind_b2PrismaticJoint_GetJointSpeed_0 = Module["_emscripten_bind_b2PrismaticJoint_GetJointSpeed_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetJointSpeed_0"];
var _emscripten_bind_b2MouseJointDef_set_frequencyHz_1 = Module["_emscripten_bind_b2MouseJointDef_set_frequencyHz_1"] = asm["_emscripten_bind_b2MouseJointDef_set_frequencyHz_1"];
var _emscripten_bind_b2PulleyJointDef_get_groundAnchorA_0 = Module["_emscripten_bind_b2PulleyJointDef_get_groundAnchorA_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_groundAnchorA_0"];
var _emscripten_bind_b2Joint_GetAnchorA_0 = Module["_emscripten_bind_b2Joint_GetAnchorA_0"] = asm["_emscripten_bind_b2Joint_GetAnchorA_0"];
var _emscripten_bind_b2Contact_GetRestitution_0 = Module["_emscripten_bind_b2Contact_GetRestitution_0"] = asm["_emscripten_bind_b2Contact_GetRestitution_0"];
var _emscripten_bind_b2ContactEdge_get_contact_0 = Module["_emscripten_bind_b2ContactEdge_get_contact_0"] = asm["_emscripten_bind_b2ContactEdge_get_contact_0"];
var _emscripten_bind_b2RevoluteJointDef_get_userData_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_userData_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_userData_0"];
var _emscripten_bind_b2Body_ResetMassData_0 = Module["_emscripten_bind_b2Body_ResetMassData_0"] = asm["_emscripten_bind_b2Body_ResetMassData_0"];
var _emscripten_bind_b2Fixture_GetAABB_1 = Module["_emscripten_bind_b2Fixture_GetAABB_1"] = asm["_emscripten_bind_b2Fixture_GetAABB_1"];
var _emscripten_bind_b2PrismaticJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_collideConnected_1"];
var _emscripten_bind_b2Body_GetMassData_1 = Module["_emscripten_bind_b2Body_GetMassData_1"] = asm["_emscripten_bind_b2Body_GetMassData_1"];
var _emscripten_bind_b2RevoluteJointDef_get_localAnchorA_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_localAnchorA_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_localAnchorA_0"];
var _emscripten_bind_b2EdgeShape_ComputeMass_2 = Module["_emscripten_bind_b2EdgeShape_ComputeMass_2"] = asm["_emscripten_bind_b2EdgeShape_ComputeMass_2"];
var _emscripten_bind_b2GearJointDef_get_bodyB_0 = Module["_emscripten_bind_b2GearJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2GearJointDef_get_bodyB_0"];
var _emscripten_enum_b2LimitState_e_atLowerLimit = Module["_emscripten_enum_b2LimitState_e_atLowerLimit"] = asm["_emscripten_enum_b2LimitState_e_atLowerLimit"];
var _emscripten_bind_b2ManifoldPoint_set_id_1 = Module["_emscripten_bind_b2ManifoldPoint_set_id_1"] = asm["_emscripten_bind_b2ManifoldPoint_set_id_1"];
var _emscripten_bind_b2WheelJointDef_get_bodyB_0 = Module["_emscripten_bind_b2WheelJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2WheelJointDef_get_bodyB_0"];
var _emscripten_bind_b2WeldJoint_GetLocalAnchorB_0 = Module["_emscripten_bind_b2WeldJoint_GetLocalAnchorB_0"] = asm["_emscripten_bind_b2WeldJoint_GetLocalAnchorB_0"];
var _emscripten_bind_b2RevoluteJointDef_set_localAnchorB_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_localAnchorB_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_localAnchorB_1"];
var _emscripten_bind_b2Body_DestroyFixture_1 = Module["_emscripten_bind_b2Body_DestroyFixture_1"] = asm["_emscripten_bind_b2Body_DestroyFixture_1"];
var _emscripten_bind_b2Profile_set_broadphase_1 = Module["_emscripten_bind_b2Profile_set_broadphase_1"] = asm["_emscripten_bind_b2Profile_set_broadphase_1"];
var _emscripten_bind_b2WheelJointDef_get_localAnchorB_0 = Module["_emscripten_bind_b2WheelJointDef_get_localAnchorB_0"] = asm["_emscripten_bind_b2WheelJointDef_get_localAnchorB_0"];
var _emscripten_bind_b2ContactImpulse_get_count_0 = Module["_emscripten_bind_b2ContactImpulse_get_count_0"] = asm["_emscripten_bind_b2ContactImpulse_get_count_0"];
var _emscripten_bind_b2World_GetJointCount_0 = Module["_emscripten_bind_b2World_GetJointCount_0"] = asm["_emscripten_bind_b2World_GetJointCount_0"];
var _emscripten_bind_b2WheelJoint_GetMotorSpeed_0 = Module["_emscripten_bind_b2WheelJoint_GetMotorSpeed_0"] = asm["_emscripten_bind_b2WheelJoint_GetMotorSpeed_0"];
var _emscripten_bind_b2WheelJointDef_get_dampingRatio_0 = Module["_emscripten_bind_b2WheelJointDef_get_dampingRatio_0"] = asm["_emscripten_bind_b2WheelJointDef_get_dampingRatio_0"];
var _emscripten_bind_b2RayCastOutput_get_fraction_0 = Module["_emscripten_bind_b2RayCastOutput_get_fraction_0"] = asm["_emscripten_bind_b2RayCastOutput_get_fraction_0"];
var _emscripten_bind_b2AABB___destroy___0 = Module["_emscripten_bind_b2AABB___destroy___0"] = asm["_emscripten_bind_b2AABB___destroy___0"];
var _emscripten_bind_b2GearJoint_SetRatio_1 = Module["_emscripten_bind_b2GearJoint_SetRatio_1"] = asm["_emscripten_bind_b2GearJoint_SetRatio_1"];
var _emscripten_bind_b2Body_ApplyLinearImpulse_3 = Module["_emscripten_bind_b2Body_ApplyLinearImpulse_3"] = asm["_emscripten_bind_b2Body_ApplyLinearImpulse_3"];
var _emscripten_bind_b2Filter___destroy___0 = Module["_emscripten_bind_b2Filter___destroy___0"] = asm["_emscripten_bind_b2Filter___destroy___0"];
var _emscripten_bind_b2RopeJointDef_get_userData_0 = Module["_emscripten_bind_b2RopeJointDef_get_userData_0"] = asm["_emscripten_bind_b2RopeJointDef_get_userData_0"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var _emscripten_bind_b2BodyDef_get_fixedRotation_0 = Module["_emscripten_bind_b2BodyDef_get_fixedRotation_0"] = asm["_emscripten_bind_b2BodyDef_get_fixedRotation_0"];
var _emscripten_bind_b2PrismaticJointDef_set_motorSpeed_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_motorSpeed_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_motorSpeed_1"];
var _emscripten_bind_b2ChainShape_SetPrevVertex_1 = Module["_emscripten_bind_b2ChainShape_SetPrevVertex_1"] = asm["_emscripten_bind_b2ChainShape_SetPrevVertex_1"];
var _emscripten_bind_b2MotorJoint_IsActive_0 = Module["_emscripten_bind_b2MotorJoint_IsActive_0"] = asm["_emscripten_bind_b2MotorJoint_IsActive_0"];
var _emscripten_bind_b2MouseJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2MouseJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2MouseJoint_GetReactionTorque_1"];
var _emscripten_bind_b2DistanceJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2DistanceJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2DistanceJointDef_set_collideConnected_1"];
var _emscripten_bind_b2WheelJoint_GetUserData_0 = Module["_emscripten_bind_b2WheelJoint_GetUserData_0"] = asm["_emscripten_bind_b2WheelJoint_GetUserData_0"];
var _emscripten_bind_b2Vec3_op_sub_1 = Module["_emscripten_bind_b2Vec3_op_sub_1"] = asm["_emscripten_bind_b2Vec3_op_sub_1"];
var _emscripten_bind_b2WheelJoint_GetNext_0 = Module["_emscripten_bind_b2WheelJoint_GetNext_0"] = asm["_emscripten_bind_b2WheelJoint_GetNext_0"];
var _emscripten_bind_b2Shape_GetType_0 = Module["_emscripten_bind_b2Shape_GetType_0"] = asm["_emscripten_bind_b2Shape_GetType_0"];
var _emscripten_bind_b2AABB_IsValid_0 = Module["_emscripten_bind_b2AABB_IsValid_0"] = asm["_emscripten_bind_b2AABB_IsValid_0"];
var _emscripten_bind_b2WheelJoint_GetBodyA_0 = Module["_emscripten_bind_b2WheelJoint_GetBodyA_0"] = asm["_emscripten_bind_b2WheelJoint_GetBodyA_0"];
var _emscripten_enum_b2ShapeType_e_chain = Module["_emscripten_enum_b2ShapeType_e_chain"] = asm["_emscripten_enum_b2ShapeType_e_chain"];
var _emscripten_bind_b2PulleyJoint_GetLengthA_0 = Module["_emscripten_bind_b2PulleyJoint_GetLengthA_0"] = asm["_emscripten_bind_b2PulleyJoint_GetLengthA_0"];
var _emscripten_bind_b2DistanceJointDef_get_frequencyHz_0 = Module["_emscripten_bind_b2DistanceJointDef_get_frequencyHz_0"] = asm["_emscripten_bind_b2DistanceJointDef_get_frequencyHz_0"];
var _emscripten_bind_b2RevoluteJoint_SetMotorSpeed_1 = Module["_emscripten_bind_b2RevoluteJoint_SetMotorSpeed_1"] = asm["_emscripten_bind_b2RevoluteJoint_SetMotorSpeed_1"];
var _emscripten_bind_b2World___destroy___0 = Module["_emscripten_bind_b2World___destroy___0"] = asm["_emscripten_bind_b2World___destroy___0"];
var _emscripten_bind_b2ChainShape_set_m_prevVertex_1 = Module["_emscripten_bind_b2ChainShape_set_m_prevVertex_1"] = asm["_emscripten_bind_b2ChainShape_set_m_prevVertex_1"];
var _emscripten_bind_b2ChainShape_get_m_hasNextVertex_0 = Module["_emscripten_bind_b2ChainShape_get_m_hasNextVertex_0"] = asm["_emscripten_bind_b2ChainShape_get_m_hasNextVertex_0"];
var _emscripten_bind_b2ChainShape_SetNextVertex_1 = Module["_emscripten_bind_b2ChainShape_SetNextVertex_1"] = asm["_emscripten_bind_b2ChainShape_SetNextVertex_1"];
var _emscripten_bind_b2Body_SetType_1 = Module["_emscripten_bind_b2Body_SetType_1"] = asm["_emscripten_bind_b2Body_SetType_1"];
var _emscripten_bind_b2Body_GetMass_0 = Module["_emscripten_bind_b2Body_GetMass_0"] = asm["_emscripten_bind_b2Body_GetMass_0"];
var _emscripten_bind_b2Rot_b2Rot_0 = Module["_emscripten_bind_b2Rot_b2Rot_0"] = asm["_emscripten_bind_b2Rot_b2Rot_0"];
var _emscripten_bind_b2Rot_b2Rot_1 = Module["_emscripten_bind_b2Rot_b2Rot_1"] = asm["_emscripten_bind_b2Rot_b2Rot_1"];
var _emscripten_enum_b2JointType_e_distanceJoint = Module["_emscripten_enum_b2JointType_e_distanceJoint"] = asm["_emscripten_enum_b2JointType_e_distanceJoint"];
var _emscripten_bind_b2WheelJoint_SetSpringDampingRatio_1 = Module["_emscripten_bind_b2WheelJoint_SetSpringDampingRatio_1"] = asm["_emscripten_bind_b2WheelJoint_SetSpringDampingRatio_1"];
var _emscripten_bind_b2MouseJoint_GetType_0 = Module["_emscripten_bind_b2MouseJoint_GetType_0"] = asm["_emscripten_bind_b2MouseJoint_GetType_0"];
var _emscripten_bind_b2MouseJoint_GetTarget_0 = Module["_emscripten_bind_b2MouseJoint_GetTarget_0"] = asm["_emscripten_bind_b2MouseJoint_GetTarget_0"];
var _emscripten_bind_JSQueryCallback___destroy___0 = Module["_emscripten_bind_JSQueryCallback___destroy___0"] = asm["_emscripten_bind_JSQueryCallback___destroy___0"];
var _emscripten_bind_b2Fixture_Refilter_0 = Module["_emscripten_bind_b2Fixture_Refilter_0"] = asm["_emscripten_bind_b2Fixture_Refilter_0"];
var _emscripten_bind_b2RevoluteJointDef_set_lowerAngle_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_lowerAngle_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_lowerAngle_1"];
var _emscripten_bind_b2JointEdge___destroy___0 = Module["_emscripten_bind_b2JointEdge___destroy___0"] = asm["_emscripten_bind_b2JointEdge___destroy___0"];
var _emscripten_bind_b2PulleyJoint_GetRatio_0 = Module["_emscripten_bind_b2PulleyJoint_GetRatio_0"] = asm["_emscripten_bind_b2PulleyJoint_GetRatio_0"];
var _emscripten_bind_JSContactListener_BeginContact_1 = Module["_emscripten_bind_JSContactListener_BeginContact_1"] = asm["_emscripten_bind_JSContactListener_BeginContact_1"];
var _emscripten_bind_b2MotorJointDef_set_linearOffset_1 = Module["_emscripten_bind_b2MotorJointDef_set_linearOffset_1"] = asm["_emscripten_bind_b2MotorJointDef_set_linearOffset_1"];
var _emscripten_enum_b2JointType_e_motorJoint = Module["_emscripten_enum_b2JointType_e_motorJoint"] = asm["_emscripten_enum_b2JointType_e_motorJoint"];
var _emscripten_bind_b2EdgeShape_get_m_vertex2_0 = Module["_emscripten_bind_b2EdgeShape_get_m_vertex2_0"] = asm["_emscripten_bind_b2EdgeShape_get_m_vertex2_0"];
var _emscripten_bind_b2JointEdge_get_next_0 = Module["_emscripten_bind_b2JointEdge_get_next_0"] = asm["_emscripten_bind_b2JointEdge_get_next_0"];
var _emscripten_bind_b2RayCastInput_set_maxFraction_1 = Module["_emscripten_bind_b2RayCastInput_set_maxFraction_1"] = asm["_emscripten_bind_b2RayCastInput_set_maxFraction_1"];
var _emscripten_bind_b2MouseJoint_GetBodyA_0 = Module["_emscripten_bind_b2MouseJoint_GetBodyA_0"] = asm["_emscripten_bind_b2MouseJoint_GetBodyA_0"];
var _emscripten_bind_b2BodyDef_get_awake_0 = Module["_emscripten_bind_b2BodyDef_get_awake_0"] = asm["_emscripten_bind_b2BodyDef_get_awake_0"];
var _emscripten_bind_b2AABB_b2AABB_0 = Module["_emscripten_bind_b2AABB_b2AABB_0"] = asm["_emscripten_bind_b2AABB_b2AABB_0"];
var _emscripten_bind_b2Fixture_SetFriction_1 = Module["_emscripten_bind_b2Fixture_SetFriction_1"] = asm["_emscripten_bind_b2Fixture_SetFriction_1"];
var _emscripten_enum_b2DrawFlag_e_centerOfMassBit = Module["_emscripten_enum_b2DrawFlag_e_centerOfMassBit"] = asm["_emscripten_enum_b2DrawFlag_e_centerOfMassBit"];
var _emscripten_bind_b2World_CreateBody_1 = Module["_emscripten_bind_b2World_CreateBody_1"] = asm["_emscripten_bind_b2World_CreateBody_1"];
var _emscripten_bind_b2RopeJointDef_set_userData_1 = Module["_emscripten_bind_b2RopeJointDef_set_userData_1"] = asm["_emscripten_bind_b2RopeJointDef_set_userData_1"];
var _emscripten_bind_b2WeldJoint_GetNext_0 = Module["_emscripten_bind_b2WeldJoint_GetNext_0"] = asm["_emscripten_bind_b2WeldJoint_GetNext_0"];
var _emscripten_bind_b2WeldJoint_GetType_0 = Module["_emscripten_bind_b2WeldJoint_GetType_0"] = asm["_emscripten_bind_b2WeldJoint_GetType_0"];
var _emscripten_enum_b2ContactFeatureType_e_vertex = Module["_emscripten_enum_b2ContactFeatureType_e_vertex"] = asm["_emscripten_enum_b2ContactFeatureType_e_vertex"];
var _emscripten_bind_b2Rot___destroy___0 = Module["_emscripten_bind_b2Rot___destroy___0"] = asm["_emscripten_bind_b2Rot___destroy___0"];
var _emscripten_bind_b2Filter_get_maskBits_0 = Module["_emscripten_bind_b2Filter_get_maskBits_0"] = asm["_emscripten_bind_b2Filter_get_maskBits_0"];
var _emscripten_bind_b2Mat22_get_ex_0 = Module["_emscripten_bind_b2Mat22_get_ex_0"] = asm["_emscripten_bind_b2Mat22_get_ex_0"];
var _emscripten_bind_b2Body_GetFixtureList_0 = Module["_emscripten_bind_b2Body_GetFixtureList_0"] = asm["_emscripten_bind_b2Body_GetFixtureList_0"];
var _emscripten_bind_b2PulleyJoint___destroy___0 = Module["_emscripten_bind_b2PulleyJoint___destroy___0"] = asm["_emscripten_bind_b2PulleyJoint___destroy___0"];
var _emscripten_bind_b2MouseJointDef_set_dampingRatio_1 = Module["_emscripten_bind_b2MouseJointDef_set_dampingRatio_1"] = asm["_emscripten_bind_b2MouseJointDef_set_dampingRatio_1"];
var _emscripten_bind_JSRayCastCallback___destroy___0 = Module["_emscripten_bind_JSRayCastCallback___destroy___0"] = asm["_emscripten_bind_JSRayCastCallback___destroy___0"];
var _emscripten_bind_b2ContactListener___destroy___0 = Module["_emscripten_bind_b2ContactListener___destroy___0"] = asm["_emscripten_bind_b2ContactListener___destroy___0"];
var _emscripten_bind_b2PrismaticJointDef_set_localAnchorB_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_localAnchorB_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_localAnchorB_1"];
var _emscripten_bind_b2FrictionJoint___destroy___0 = Module["_emscripten_bind_b2FrictionJoint___destroy___0"] = asm["_emscripten_bind_b2FrictionJoint___destroy___0"];
var _emscripten_bind_b2WeldJoint_Dump_0 = Module["_emscripten_bind_b2WeldJoint_Dump_0"] = asm["_emscripten_bind_b2WeldJoint_Dump_0"];
var _emscripten_bind_b2MotorJoint_SetMaxForce_1 = Module["_emscripten_bind_b2MotorJoint_SetMaxForce_1"] = asm["_emscripten_bind_b2MotorJoint_SetMaxForce_1"];
var _emscripten_bind_b2MouseJoint_GetFrequency_0 = Module["_emscripten_bind_b2MouseJoint_GetFrequency_0"] = asm["_emscripten_bind_b2MouseJoint_GetFrequency_0"];
var _emscripten_bind_b2FrictionJoint_GetLocalAnchorA_0 = Module["_emscripten_bind_b2FrictionJoint_GetLocalAnchorA_0"] = asm["_emscripten_bind_b2FrictionJoint_GetLocalAnchorA_0"];
var _emscripten_bind_b2RevoluteJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_collideConnected_1"];
var _emscripten_bind_b2GearJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2GearJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2GearJointDef_set_collideConnected_1"];
var _emscripten_bind_b2Vec2_IsValid_0 = Module["_emscripten_bind_b2Vec2_IsValid_0"] = asm["_emscripten_bind_b2Vec2_IsValid_0"];
var _emscripten_bind_b2PrismaticJointDef_set_bodyA_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_bodyA_1"];
var _emscripten_bind_b2World_GetWarmStarting_0 = Module["_emscripten_bind_b2World_GetWarmStarting_0"] = asm["_emscripten_bind_b2World_GetWarmStarting_0"];
var _emscripten_bind_b2RevoluteJointDef_set_enableLimit_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_enableLimit_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_enableLimit_1"];
var _emscripten_bind_b2WeldJointDef___destroy___0 = Module["_emscripten_bind_b2WeldJointDef___destroy___0"] = asm["_emscripten_bind_b2WeldJointDef___destroy___0"];
var _emscripten_bind_b2Mat22_Solve_1 = Module["_emscripten_bind_b2Mat22_Solve_1"] = asm["_emscripten_bind_b2Mat22_Solve_1"];
var _emscripten_bind_b2Color_get_g_0 = Module["_emscripten_bind_b2Color_get_g_0"] = asm["_emscripten_bind_b2Color_get_g_0"];
var _emscripten_bind_VoidPtr___destroy___0 = Module["_emscripten_bind_VoidPtr___destroy___0"] = asm["_emscripten_bind_VoidPtr___destroy___0"];
var _emscripten_bind_b2RopeJoint_GetNext_0 = Module["_emscripten_bind_b2RopeJoint_GetNext_0"] = asm["_emscripten_bind_b2RopeJoint_GetNext_0"];
var _emscripten_bind_b2EdgeShape_get_m_type_0 = Module["_emscripten_bind_b2EdgeShape_get_m_type_0"] = asm["_emscripten_bind_b2EdgeShape_get_m_type_0"];
var _emscripten_bind_b2PolygonShape_GetChildCount_0 = Module["_emscripten_bind_b2PolygonShape_GetChildCount_0"] = asm["_emscripten_bind_b2PolygonShape_GetChildCount_0"];
var _emscripten_bind_b2GearJointDef_get_ratio_0 = Module["_emscripten_bind_b2GearJointDef_get_ratio_0"] = asm["_emscripten_bind_b2GearJointDef_get_ratio_0"];
var _emscripten_bind_b2Mat33_Solve33_1 = Module["_emscripten_bind_b2Mat33_Solve33_1"] = asm["_emscripten_bind_b2Mat33_Solve33_1"];
var _emscripten_bind_b2WeldJointDef_set_userData_1 = Module["_emscripten_bind_b2WeldJointDef_set_userData_1"] = asm["_emscripten_bind_b2WeldJointDef_set_userData_1"];
var _emscripten_bind_b2PrismaticJoint_GetLocalAnchorB_0 = Module["_emscripten_bind_b2PrismaticJoint_GetLocalAnchorB_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetLocalAnchorB_0"];
var _emscripten_bind_b2RevoluteJointDef___destroy___0 = Module["_emscripten_bind_b2RevoluteJointDef___destroy___0"] = asm["_emscripten_bind_b2RevoluteJointDef___destroy___0"];
var _emscripten_bind_b2MotorJointDef_get_correctionFactor_0 = Module["_emscripten_bind_b2MotorJointDef_get_correctionFactor_0"] = asm["_emscripten_bind_b2MotorJointDef_get_correctionFactor_0"];
var _emscripten_bind_b2ContactFeature_get_typeB_0 = Module["_emscripten_bind_b2ContactFeature_get_typeB_0"] = asm["_emscripten_bind_b2ContactFeature_get_typeB_0"];
var _emscripten_bind_b2ContactID_get_key_0 = Module["_emscripten_bind_b2ContactID_get_key_0"] = asm["_emscripten_bind_b2ContactID_get_key_0"];
var _emscripten_bind_b2MotorJoint_GetReactionForce_1 = Module["_emscripten_bind_b2MotorJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2MotorJoint_GetReactionForce_1"];
var _emscripten_bind_b2Rot_GetAngle_0 = Module["_emscripten_bind_b2Rot_GetAngle_0"] = asm["_emscripten_bind_b2Rot_GetAngle_0"];
var _emscripten_bind_b2World_SetAllowSleeping_1 = Module["_emscripten_bind_b2World_SetAllowSleeping_1"] = asm["_emscripten_bind_b2World_SetAllowSleeping_1"];
var _emscripten_bind_b2RopeJoint_GetType_0 = Module["_emscripten_bind_b2RopeJoint_GetType_0"] = asm["_emscripten_bind_b2RopeJoint_GetType_0"];
var _emscripten_bind_b2MotorJoint_SetAngularOffset_1 = Module["_emscripten_bind_b2MotorJoint_SetAngularOffset_1"] = asm["_emscripten_bind_b2MotorJoint_SetAngularOffset_1"];
var _emscripten_bind_b2MotorJoint_GetLinearOffset_0 = Module["_emscripten_bind_b2MotorJoint_GetLinearOffset_0"] = asm["_emscripten_bind_b2MotorJoint_GetLinearOffset_0"];
var _emscripten_bind_b2FrictionJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2FrictionJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2FrictionJoint_GetCollideConnected_0"];
var _emscripten_bind_b2WheelJointDef_set_motorSpeed_1 = Module["_emscripten_bind_b2WheelJointDef_set_motorSpeed_1"] = asm["_emscripten_bind_b2WheelJointDef_set_motorSpeed_1"];
var _emscripten_bind_b2MotorJoint_GetAnchorA_0 = Module["_emscripten_bind_b2MotorJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2MotorJoint_GetAnchorA_0"];
var _emscripten_bind_b2Fixture_GetDensity_0 = Module["_emscripten_bind_b2Fixture_GetDensity_0"] = asm["_emscripten_bind_b2Fixture_GetDensity_0"];
var _emscripten_bind_b2MouseJointDef_get_type_0 = Module["_emscripten_bind_b2MouseJointDef_get_type_0"] = asm["_emscripten_bind_b2MouseJointDef_get_type_0"];
var _emscripten_bind_b2Vec2_Set_2 = Module["_emscripten_bind_b2Vec2_Set_2"] = asm["_emscripten_bind_b2Vec2_Set_2"];
var _emscripten_bind_b2WeldJointDef_get_type_0 = Module["_emscripten_bind_b2WeldJointDef_get_type_0"] = asm["_emscripten_bind_b2WeldJointDef_get_type_0"];
var _emscripten_bind_b2MouseJointDef_b2MouseJointDef_0 = Module["_emscripten_bind_b2MouseJointDef_b2MouseJointDef_0"] = asm["_emscripten_bind_b2MouseJointDef_b2MouseJointDef_0"];
var _emscripten_bind_b2Rot_get_s_0 = Module["_emscripten_bind_b2Rot_get_s_0"] = asm["_emscripten_bind_b2Rot_get_s_0"];
var _emscripten_bind_b2FrictionJoint_SetMaxTorque_1 = Module["_emscripten_bind_b2FrictionJoint_SetMaxTorque_1"] = asm["_emscripten_bind_b2FrictionJoint_SetMaxTorque_1"];
var _emscripten_bind_b2MouseJointDef_get_frequencyHz_0 = Module["_emscripten_bind_b2MouseJointDef_get_frequencyHz_0"] = asm["_emscripten_bind_b2MouseJointDef_get_frequencyHz_0"];
var _emscripten_bind_b2FrictionJoint_SetUserData_1 = Module["_emscripten_bind_b2FrictionJoint_SetUserData_1"] = asm["_emscripten_bind_b2FrictionJoint_SetUserData_1"];
var _emscripten_bind_b2RayCastInput_get_p1_0 = Module["_emscripten_bind_b2RayCastInput_get_p1_0"] = asm["_emscripten_bind_b2RayCastInput_get_p1_0"];
var _emscripten_bind_b2DistanceJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2DistanceJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2DistanceJointDef_get_collideConnected_0"];
var _emscripten_bind_b2RevoluteJointDef_set_referenceAngle_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_referenceAngle_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_referenceAngle_1"];
var _emscripten_bind_b2ContactFeature___destroy___0 = Module["_emscripten_bind_b2ContactFeature___destroy___0"] = asm["_emscripten_bind_b2ContactFeature___destroy___0"];
var _emscripten_bind_b2Color___destroy___0 = Module["_emscripten_bind_b2Color___destroy___0"] = asm["_emscripten_bind_b2Color___destroy___0"];
var _emscripten_bind_b2DistanceJointDef_set_bodyB_1 = Module["_emscripten_bind_b2DistanceJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2DistanceJointDef_set_bodyB_1"];
var _emscripten_bind_b2ChainShape_get_m_hasPrevVertex_0 = Module["_emscripten_bind_b2ChainShape_get_m_hasPrevVertex_0"] = asm["_emscripten_bind_b2ChainShape_get_m_hasPrevVertex_0"];
var _emscripten_bind_b2PulleyJointDef_b2PulleyJointDef_0 = Module["_emscripten_bind_b2PulleyJointDef_b2PulleyJointDef_0"] = asm["_emscripten_bind_b2PulleyJointDef_b2PulleyJointDef_0"];
var _emscripten_bind_b2RevoluteJoint_GetType_0 = Module["_emscripten_bind_b2RevoluteJoint_GetType_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetType_0"];
var _emscripten_bind_b2MassData_b2MassData_0 = Module["_emscripten_bind_b2MassData_b2MassData_0"] = asm["_emscripten_bind_b2MassData_b2MassData_0"];
var _emscripten_bind_b2Vec3_set_y_1 = Module["_emscripten_bind_b2Vec3_set_y_1"] = asm["_emscripten_bind_b2Vec3_set_y_1"];
var _emscripten_bind_b2BodyDef_set_angularDamping_1 = Module["_emscripten_bind_b2BodyDef_set_angularDamping_1"] = asm["_emscripten_bind_b2BodyDef_set_angularDamping_1"];
var _emscripten_bind_b2AABB_Combine_1 = Module["_emscripten_bind_b2AABB_Combine_1"] = asm["_emscripten_bind_b2AABB_Combine_1"];
var _emscripten_bind_b2WheelJointDef_set_bodyB_1 = Module["_emscripten_bind_b2WheelJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2WheelJointDef_set_bodyB_1"];
var _emscripten_bind_b2PrismaticJoint_GetBodyA_0 = Module["_emscripten_bind_b2PrismaticJoint_GetBodyA_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetBodyA_0"];
var _emscripten_bind_b2PrismaticJoint_GetMaxMotorForce_0 = Module["_emscripten_bind_b2PrismaticJoint_GetMaxMotorForce_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetMaxMotorForce_0"];
var _emscripten_bind_b2RevoluteJointDef_get_upperAngle_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_upperAngle_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_upperAngle_0"];
var _emscripten_bind_b2Body_IsSleepingAllowed_0 = Module["_emscripten_bind_b2Body_IsSleepingAllowed_0"] = asm["_emscripten_bind_b2Body_IsSleepingAllowed_0"];
var _emscripten_bind_b2MotorJoint_GetCorrectionFactor_0 = Module["_emscripten_bind_b2MotorJoint_GetCorrectionFactor_0"] = asm["_emscripten_bind_b2MotorJoint_GetCorrectionFactor_0"];
var _emscripten_bind_b2Profile_get_solve_0 = Module["_emscripten_bind_b2Profile_get_solve_0"] = asm["_emscripten_bind_b2Profile_get_solve_0"];
var _emscripten_bind_JSDestructionListener_SayGoodbyeFixture_1 = Module["_emscripten_bind_JSDestructionListener_SayGoodbyeFixture_1"] = asm["_emscripten_bind_JSDestructionListener_SayGoodbyeFixture_1"];
var _emscripten_bind_b2PolygonShape_GetVertexCount_0 = Module["_emscripten_bind_b2PolygonShape_GetVertexCount_0"] = asm["_emscripten_bind_b2PolygonShape_GetVertexCount_0"];
var _emscripten_bind_b2Rot_get_c_0 = Module["_emscripten_bind_b2Rot_get_c_0"] = asm["_emscripten_bind_b2Rot_get_c_0"];
var _emscripten_bind_b2AABB_set_lowerBound_1 = Module["_emscripten_bind_b2AABB_set_lowerBound_1"] = asm["_emscripten_bind_b2AABB_set_lowerBound_1"];
var _emscripten_bind_b2Fixture_SetFilterData_1 = Module["_emscripten_bind_b2Fixture_SetFilterData_1"] = asm["_emscripten_bind_b2Fixture_SetFilterData_1"];
var _emscripten_bind_b2MouseJoint_SetMaxForce_1 = Module["_emscripten_bind_b2MouseJoint_SetMaxForce_1"] = asm["_emscripten_bind_b2MouseJoint_SetMaxForce_1"];
var _emscripten_bind_b2WheelJoint_IsMotorEnabled_0 = Module["_emscripten_bind_b2WheelJoint_IsMotorEnabled_0"] = asm["_emscripten_bind_b2WheelJoint_IsMotorEnabled_0"];
var _emscripten_bind_b2JointDef_set_userData_1 = Module["_emscripten_bind_b2JointDef_set_userData_1"] = asm["_emscripten_bind_b2JointDef_set_userData_1"];
var _emscripten_bind_b2ManifoldPoint_get_tangentImpulse_0 = Module["_emscripten_bind_b2ManifoldPoint_get_tangentImpulse_0"] = asm["_emscripten_bind_b2ManifoldPoint_get_tangentImpulse_0"];
var _emscripten_bind_b2RevoluteJointDef_get_maxMotorTorque_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_maxMotorTorque_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_maxMotorTorque_0"];
var _emscripten_bind_b2WeldJointDef_get_dampingRatio_0 = Module["_emscripten_bind_b2WeldJointDef_get_dampingRatio_0"] = asm["_emscripten_bind_b2WeldJointDef_get_dampingRatio_0"];
var _emscripten_bind_b2Rot_SetIdentity_0 = Module["_emscripten_bind_b2Rot_SetIdentity_0"] = asm["_emscripten_bind_b2Rot_SetIdentity_0"];
var _emscripten_bind_b2EdgeShape_b2EdgeShape_0 = Module["_emscripten_bind_b2EdgeShape_b2EdgeShape_0"] = asm["_emscripten_bind_b2EdgeShape_b2EdgeShape_0"];
var _emscripten_bind_b2FrictionJoint_GetReactionForce_1 = Module["_emscripten_bind_b2FrictionJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2FrictionJoint_GetReactionForce_1"];
var _emscripten_bind_b2MouseJoint_GetUserData_0 = Module["_emscripten_bind_b2MouseJoint_GetUserData_0"] = asm["_emscripten_bind_b2MouseJoint_GetUserData_0"];
var _emscripten_bind_b2DistanceJointDef_set_type_1 = Module["_emscripten_bind_b2DistanceJointDef_set_type_1"] = asm["_emscripten_bind_b2DistanceJointDef_set_type_1"];
var _emscripten_bind_b2WeldJoint_GetAnchorA_0 = Module["_emscripten_bind_b2WeldJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2WeldJoint_GetAnchorA_0"];
var _emscripten_bind_b2WeldJoint___destroy___0 = Module["_emscripten_bind_b2WeldJoint___destroy___0"] = asm["_emscripten_bind_b2WeldJoint___destroy___0"];
var _emscripten_bind_b2Manifold_b2Manifold_0 = Module["_emscripten_bind_b2Manifold_b2Manifold_0"] = asm["_emscripten_bind_b2Manifold_b2Manifold_0"];
var _emscripten_bind_JSContactListener_PostSolve_2 = Module["_emscripten_bind_JSContactListener_PostSolve_2"] = asm["_emscripten_bind_JSContactListener_PostSolve_2"];
var _emscripten_bind_b2PulleyJoint_GetBodyA_0 = Module["_emscripten_bind_b2PulleyJoint_GetBodyA_0"] = asm["_emscripten_bind_b2PulleyJoint_GetBodyA_0"];
var _emscripten_bind_b2RopeJointDef_get_type_0 = Module["_emscripten_bind_b2RopeJointDef_get_type_0"] = asm["_emscripten_bind_b2RopeJointDef_get_type_0"];
var _emscripten_bind_b2CircleShape_ComputeMass_2 = Module["_emscripten_bind_b2CircleShape_ComputeMass_2"] = asm["_emscripten_bind_b2CircleShape_ComputeMass_2"];
var _emscripten_bind_b2DistanceJointDef_get_localAnchorB_0 = Module["_emscripten_bind_b2DistanceJointDef_get_localAnchorB_0"] = asm["_emscripten_bind_b2DistanceJointDef_get_localAnchorB_0"];
var _emscripten_bind_b2GearJointDef___destroy___0 = Module["_emscripten_bind_b2GearJointDef___destroy___0"] = asm["_emscripten_bind_b2GearJointDef___destroy___0"];
var _emscripten_bind_b2PulleyJointDef_set_localAnchorA_1 = Module["_emscripten_bind_b2PulleyJointDef_set_localAnchorA_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_localAnchorA_1"];
var _emscripten_bind_b2CircleShape_TestPoint_2 = Module["_emscripten_bind_b2CircleShape_TestPoint_2"] = asm["_emscripten_bind_b2CircleShape_TestPoint_2"];
var _emscripten_bind_b2MotorJointDef_get_maxTorque_0 = Module["_emscripten_bind_b2MotorJointDef_get_maxTorque_0"] = asm["_emscripten_bind_b2MotorJointDef_get_maxTorque_0"];
var _emscripten_bind_b2Body_GetLinearVelocityFromLocalPoint_1 = Module["_emscripten_bind_b2Body_GetLinearVelocityFromLocalPoint_1"] = asm["_emscripten_bind_b2Body_GetLinearVelocityFromLocalPoint_1"];
var _emscripten_bind_b2FrictionJointDef_set_bodyB_1 = Module["_emscripten_bind_b2FrictionJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2FrictionJointDef_set_bodyB_1"];
var _emscripten_bind_b2MouseJoint_GetAnchorB_0 = Module["_emscripten_bind_b2MouseJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2MouseJoint_GetAnchorB_0"];
var _emscripten_bind_b2RopeJointDef_get_localAnchorB_0 = Module["_emscripten_bind_b2RopeJointDef_get_localAnchorB_0"] = asm["_emscripten_bind_b2RopeJointDef_get_localAnchorB_0"];
var _emscripten_bind_b2GearJoint_GetBodyB_0 = Module["_emscripten_bind_b2GearJoint_GetBodyB_0"] = asm["_emscripten_bind_b2GearJoint_GetBodyB_0"];
var _emscripten_bind_b2ChainShape_Clear_0 = Module["_emscripten_bind_b2ChainShape_Clear_0"] = asm["_emscripten_bind_b2ChainShape_Clear_0"];
var _emscripten_bind_b2CircleShape___destroy___0 = Module["_emscripten_bind_b2CircleShape___destroy___0"] = asm["_emscripten_bind_b2CircleShape___destroy___0"];
var _emscripten_bind_b2MotorJoint_GetType_0 = Module["_emscripten_bind_b2MotorJoint_GetType_0"] = asm["_emscripten_bind_b2MotorJoint_GetType_0"];
var _emscripten_bind_b2World_GetContactCount_0 = Module["_emscripten_bind_b2World_GetContactCount_0"] = asm["_emscripten_bind_b2World_GetContactCount_0"];
var _emscripten_bind_b2Contact_SetRestitution_1 = Module["_emscripten_bind_b2Contact_SetRestitution_1"] = asm["_emscripten_bind_b2Contact_SetRestitution_1"];
var _emscripten_bind_b2BodyDef_get_angularDamping_0 = Module["_emscripten_bind_b2BodyDef_get_angularDamping_0"] = asm["_emscripten_bind_b2BodyDef_get_angularDamping_0"];
var _emscripten_bind_b2EdgeShape_get_m_vertex3_0 = Module["_emscripten_bind_b2EdgeShape_get_m_vertex3_0"] = asm["_emscripten_bind_b2EdgeShape_get_m_vertex3_0"];
var _emscripten_bind_b2MassData_set_center_1 = Module["_emscripten_bind_b2MassData_set_center_1"] = asm["_emscripten_bind_b2MassData_set_center_1"];
var _emscripten_bind_b2Transform_SetIdentity_0 = Module["_emscripten_bind_b2Transform_SetIdentity_0"] = asm["_emscripten_bind_b2Transform_SetIdentity_0"];
var _emscripten_bind_b2GearJointDef_set_joint1_1 = Module["_emscripten_bind_b2GearJointDef_set_joint1_1"] = asm["_emscripten_bind_b2GearJointDef_set_joint1_1"];
var _emscripten_bind_b2EdgeShape_set_m_vertex2_1 = Module["_emscripten_bind_b2EdgeShape_set_m_vertex2_1"] = asm["_emscripten_bind_b2EdgeShape_set_m_vertex2_1"];
var _emscripten_bind_b2Contact_SetFriction_1 = Module["_emscripten_bind_b2Contact_SetFriction_1"] = asm["_emscripten_bind_b2Contact_SetFriction_1"];
var _emscripten_bind_b2MouseJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2MouseJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2MouseJointDef_set_collideConnected_1"];
var _emscripten_bind_b2ContactFeature_set_indexB_1 = Module["_emscripten_bind_b2ContactFeature_set_indexB_1"] = asm["_emscripten_bind_b2ContactFeature_set_indexB_1"];
var _emscripten_bind_b2Body_GetLinearVelocityFromWorldPoint_1 = Module["_emscripten_bind_b2Body_GetLinearVelocityFromWorldPoint_1"] = asm["_emscripten_bind_b2Body_GetLinearVelocityFromWorldPoint_1"];
var _emscripten_bind_b2WeldJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2WeldJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2WeldJoint_GetCollideConnected_0"];
var _emscripten_bind_b2Mat22_GetInverse_0 = Module["_emscripten_bind_b2Mat22_GetInverse_0"] = asm["_emscripten_bind_b2Mat22_GetInverse_0"];
var _emscripten_bind_b2WheelJointDef_set_frequencyHz_1 = Module["_emscripten_bind_b2WheelJointDef_set_frequencyHz_1"] = asm["_emscripten_bind_b2WheelJointDef_set_frequencyHz_1"];
var _emscripten_bind_b2World_GetSubStepping_0 = Module["_emscripten_bind_b2World_GetSubStepping_0"] = asm["_emscripten_bind_b2World_GetSubStepping_0"];
var _emscripten_bind_b2Rot_GetYAxis_0 = Module["_emscripten_bind_b2Rot_GetYAxis_0"] = asm["_emscripten_bind_b2Rot_GetYAxis_0"];
var _emscripten_bind_b2PrismaticJoint_EnableMotor_1 = Module["_emscripten_bind_b2PrismaticJoint_EnableMotor_1"] = asm["_emscripten_bind_b2PrismaticJoint_EnableMotor_1"];
var _emscripten_bind_b2WheelJointDef_get_localAxisA_0 = Module["_emscripten_bind_b2WheelJointDef_get_localAxisA_0"] = asm["_emscripten_bind_b2WheelJointDef_get_localAxisA_0"];
var _emscripten_bind_b2RopeJoint_GetBodyB_0 = Module["_emscripten_bind_b2RopeJoint_GetBodyB_0"] = asm["_emscripten_bind_b2RopeJoint_GetBodyB_0"];
var _emscripten_bind_b2EdgeShape_GetType_0 = Module["_emscripten_bind_b2EdgeShape_GetType_0"] = asm["_emscripten_bind_b2EdgeShape_GetType_0"];
var _emscripten_bind_b2Mat22_set_ex_1 = Module["_emscripten_bind_b2Mat22_set_ex_1"] = asm["_emscripten_bind_b2Mat22_set_ex_1"];
var _emscripten_bind_b2ManifoldPoint___destroy___0 = Module["_emscripten_bind_b2ManifoldPoint___destroy___0"] = asm["_emscripten_bind_b2ManifoldPoint___destroy___0"];
var _emscripten_enum_b2JointType_e_prismaticJoint = Module["_emscripten_enum_b2JointType_e_prismaticJoint"] = asm["_emscripten_enum_b2JointType_e_prismaticJoint"];
var _emscripten_bind_b2WeldJointDef_get_referenceAngle_0 = Module["_emscripten_bind_b2WeldJointDef_get_referenceAngle_0"] = asm["_emscripten_bind_b2WeldJointDef_get_referenceAngle_0"];
var _emscripten_bind_b2Vec2_Length_0 = Module["_emscripten_bind_b2Vec2_Length_0"] = asm["_emscripten_bind_b2Vec2_Length_0"];
var _emscripten_bind_b2Vec2_SetZero_0 = Module["_emscripten_bind_b2Vec2_SetZero_0"] = asm["_emscripten_bind_b2Vec2_SetZero_0"];
var _emscripten_bind_b2RopeJoint___destroy___0 = Module["_emscripten_bind_b2RopeJoint___destroy___0"] = asm["_emscripten_bind_b2RopeJoint___destroy___0"];
var _emscripten_bind_b2World_DestroyJoint_1 = Module["_emscripten_bind_b2World_DestroyJoint_1"] = asm["_emscripten_bind_b2World_DestroyJoint_1"];
var _emscripten_bind_b2JointDef_set_bodyB_1 = Module["_emscripten_bind_b2JointDef_set_bodyB_1"] = asm["_emscripten_bind_b2JointDef_set_bodyB_1"];
var _emscripten_bind_b2Mat22_Set_2 = Module["_emscripten_bind_b2Mat22_Set_2"] = asm["_emscripten_bind_b2Mat22_Set_2"];
var _emscripten_bind_b2JointEdge_set_next_1 = Module["_emscripten_bind_b2JointEdge_set_next_1"] = asm["_emscripten_bind_b2JointEdge_set_next_1"];
var _emscripten_bind_b2WeldJoint_GetAnchorB_0 = Module["_emscripten_bind_b2WeldJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2WeldJoint_GetAnchorB_0"];
var _emscripten_enum_b2DrawFlag_e_aabbBit = Module["_emscripten_enum_b2DrawFlag_e_aabbBit"] = asm["_emscripten_enum_b2DrawFlag_e_aabbBit"];
var _emscripten_bind_b2EdgeShape_ComputeAABB_3 = Module["_emscripten_bind_b2EdgeShape_ComputeAABB_3"] = asm["_emscripten_bind_b2EdgeShape_ComputeAABB_3"];
var _emscripten_bind_b2PolygonShape_set_m_centroid_1 = Module["_emscripten_bind_b2PolygonShape_set_m_centroid_1"] = asm["_emscripten_bind_b2PolygonShape_set_m_centroid_1"];
var _emscripten_bind_b2WheelJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2WheelJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2WheelJointDef_set_collideConnected_1"];
var _emscripten_bind_b2World_GetJointList_0 = Module["_emscripten_bind_b2World_GetJointList_0"] = asm["_emscripten_bind_b2World_GetJointList_0"];
var _emscripten_bind_b2MotorJointDef_get_type_0 = Module["_emscripten_bind_b2MotorJointDef_get_type_0"] = asm["_emscripten_bind_b2MotorJointDef_get_type_0"];
var _emscripten_bind_b2RopeJoint_GetLocalAnchorA_0 = Module["_emscripten_bind_b2RopeJoint_GetLocalAnchorA_0"] = asm["_emscripten_bind_b2RopeJoint_GetLocalAnchorA_0"];
var _emscripten_bind_b2BodyDef_set_linearDamping_1 = Module["_emscripten_bind_b2BodyDef_set_linearDamping_1"] = asm["_emscripten_bind_b2BodyDef_set_linearDamping_1"];
var _emscripten_bind_b2FrictionJoint_GetUserData_0 = Module["_emscripten_bind_b2FrictionJoint_GetUserData_0"] = asm["_emscripten_bind_b2FrictionJoint_GetUserData_0"];
var _emscripten_bind_b2Shape_TestPoint_2 = Module["_emscripten_bind_b2Shape_TestPoint_2"] = asm["_emscripten_bind_b2Shape_TestPoint_2"];
var _emscripten_bind_b2Manifold_set_localNormal_1 = Module["_emscripten_bind_b2Manifold_set_localNormal_1"] = asm["_emscripten_bind_b2Manifold_set_localNormal_1"];
var _emscripten_bind_b2JointDef_get_bodyA_0 = Module["_emscripten_bind_b2JointDef_get_bodyA_0"] = asm["_emscripten_bind_b2JointDef_get_bodyA_0"];
var _emscripten_bind_b2Body_GetLinearDamping_0 = Module["_emscripten_bind_b2Body_GetLinearDamping_0"] = asm["_emscripten_bind_b2Body_GetLinearDamping_0"];
var _emscripten_bind_b2WeldJointDef_set_frequencyHz_1 = Module["_emscripten_bind_b2WeldJointDef_set_frequencyHz_1"] = asm["_emscripten_bind_b2WeldJointDef_set_frequencyHz_1"];
var _emscripten_bind_b2BodyDef_set_userData_1 = Module["_emscripten_bind_b2BodyDef_set_userData_1"] = asm["_emscripten_bind_b2BodyDef_set_userData_1"];
var _emscripten_bind_b2PrismaticJointDef_set_enableMotor_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_enableMotor_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_enableMotor_1"];
var _emscripten_bind_b2Vec2_Skew_0 = Module["_emscripten_bind_b2Vec2_Skew_0"] = asm["_emscripten_bind_b2Vec2_Skew_0"];
var _emscripten_bind_b2MouseJoint_GetDampingRatio_0 = Module["_emscripten_bind_b2MouseJoint_GetDampingRatio_0"] = asm["_emscripten_bind_b2MouseJoint_GetDampingRatio_0"];
var _emscripten_bind_b2RevoluteJoint_GetAnchorA_0 = Module["_emscripten_bind_b2RevoluteJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetAnchorA_0"];
var _emscripten_bind_b2ContactFeature_set_typeB_1 = Module["_emscripten_bind_b2ContactFeature_set_typeB_1"] = asm["_emscripten_bind_b2ContactFeature_set_typeB_1"];
var _emscripten_bind_b2WheelJoint_GetAnchorA_0 = Module["_emscripten_bind_b2WheelJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2WheelJoint_GetAnchorA_0"];
var _emscripten_bind_b2MotorJoint_GetMaxTorque_0 = Module["_emscripten_bind_b2MotorJoint_GetMaxTorque_0"] = asm["_emscripten_bind_b2MotorJoint_GetMaxTorque_0"];
var _emscripten_bind_b2PrismaticJointDef_set_userData_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_userData_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_userData_1"];
var _emscripten_bind_b2FrictionJointDef_set_type_1 = Module["_emscripten_bind_b2FrictionJointDef_set_type_1"] = asm["_emscripten_bind_b2FrictionJointDef_set_type_1"];
var _emscripten_bind_b2FrictionJointDef_Initialize_3 = Module["_emscripten_bind_b2FrictionJointDef_Initialize_3"] = asm["_emscripten_bind_b2FrictionJointDef_Initialize_3"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var _emscripten_bind_b2FrictionJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2FrictionJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2FrictionJointDef_get_collideConnected_0"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _emscripten_bind_b2FrictionJoint_GetAnchorA_0 = Module["_emscripten_bind_b2FrictionJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2FrictionJoint_GetAnchorA_0"];
var _emscripten_enum_b2DrawFlag_e_pairBit = Module["_emscripten_enum_b2DrawFlag_e_pairBit"] = asm["_emscripten_enum_b2DrawFlag_e_pairBit"];
var _emscripten_bind_b2MassData_get_I_0 = Module["_emscripten_bind_b2MassData_get_I_0"] = asm["_emscripten_bind_b2MassData_get_I_0"];
var _emscripten_bind_b2WheelJointDef_get_motorSpeed_0 = Module["_emscripten_bind_b2WheelJointDef_get_motorSpeed_0"] = asm["_emscripten_bind_b2WheelJointDef_get_motorSpeed_0"];
var _emscripten_bind_b2Filter_set_maskBits_1 = Module["_emscripten_bind_b2Filter_set_maskBits_1"] = asm["_emscripten_bind_b2Filter_set_maskBits_1"];
var _emscripten_bind_b2WheelJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2WheelJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2WheelJoint_GetCollideConnected_0"];
var _emscripten_bind_b2EdgeShape_get_m_radius_0 = Module["_emscripten_bind_b2EdgeShape_get_m_radius_0"] = asm["_emscripten_bind_b2EdgeShape_get_m_radius_0"];
var _emscripten_bind_b2World_GetTreeHeight_0 = Module["_emscripten_bind_b2World_GetTreeHeight_0"] = asm["_emscripten_bind_b2World_GetTreeHeight_0"];
var _emscripten_bind_b2Mat22_b2Mat22_2 = Module["_emscripten_bind_b2Mat22_b2Mat22_2"] = asm["_emscripten_bind_b2Mat22_b2Mat22_2"];
var _emscripten_bind_b2PrismaticJoint_GetNext_0 = Module["_emscripten_bind_b2PrismaticJoint_GetNext_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetNext_0"];
var _emscripten_bind_b2Mat22_b2Mat22_0 = Module["_emscripten_bind_b2Mat22_b2Mat22_0"] = asm["_emscripten_bind_b2Mat22_b2Mat22_0"];
var _emscripten_bind_b2PrismaticJointDef_get_bodyA_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_bodyA_0"];
var _emscripten_bind_b2RopeJointDef_set_localAnchorA_1 = Module["_emscripten_bind_b2RopeJointDef_set_localAnchorA_1"] = asm["_emscripten_bind_b2RopeJointDef_set_localAnchorA_1"];
var _emscripten_bind_b2ChainShape_set_m_hasNextVertex_1 = Module["_emscripten_bind_b2ChainShape_set_m_hasNextVertex_1"] = asm["_emscripten_bind_b2ChainShape_set_m_hasNextVertex_1"];
var _emscripten_bind_b2Mat22_set_ey_1 = Module["_emscripten_bind_b2Mat22_set_ey_1"] = asm["_emscripten_bind_b2Mat22_set_ey_1"];
var _emscripten_bind_b2MotorJointDef_set_angularOffset_1 = Module["_emscripten_bind_b2MotorJointDef_set_angularOffset_1"] = asm["_emscripten_bind_b2MotorJointDef_set_angularOffset_1"];
var _emscripten_bind_b2CircleShape_get_m_type_0 = Module["_emscripten_bind_b2CircleShape_get_m_type_0"] = asm["_emscripten_bind_b2CircleShape_get_m_type_0"];
var _emscripten_bind_b2Body_GetType_0 = Module["_emscripten_bind_b2Body_GetType_0"] = asm["_emscripten_bind_b2Body_GetType_0"];
var _emscripten_bind_b2ContactEdge_b2ContactEdge_0 = Module["_emscripten_bind_b2ContactEdge_b2ContactEdge_0"] = asm["_emscripten_bind_b2ContactEdge_b2ContactEdge_0"];
var _emscripten_bind_b2BodyDef___destroy___0 = Module["_emscripten_bind_b2BodyDef___destroy___0"] = asm["_emscripten_bind_b2BodyDef___destroy___0"];
var _emscripten_bind_b2FrictionJointDef_set_maxTorque_1 = Module["_emscripten_bind_b2FrictionJointDef_set_maxTorque_1"] = asm["_emscripten_bind_b2FrictionJointDef_set_maxTorque_1"];
var _free = Module["_free"] = asm["_free"];
var _emscripten_bind_b2PulleyJointDef_set_groundAnchorB_1 = Module["_emscripten_bind_b2PulleyJointDef_set_groundAnchorB_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_groundAnchorB_1"];
var _emscripten_bind_b2RevoluteJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_collideConnected_0"];
var _emscripten_bind_b2DistanceJointDef_set_bodyA_1 = Module["_emscripten_bind_b2DistanceJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2DistanceJointDef_set_bodyA_1"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var _emscripten_bind_b2RevoluteJoint_SetLimits_2 = Module["_emscripten_bind_b2RevoluteJoint_SetLimits_2"] = asm["_emscripten_bind_b2RevoluteJoint_SetLimits_2"];
var _emscripten_bind_b2WeldJointDef_set_type_1 = Module["_emscripten_bind_b2WeldJointDef_set_type_1"] = asm["_emscripten_bind_b2WeldJointDef_set_type_1"];
var _emscripten_bind_b2MotorJointDef___destroy___0 = Module["_emscripten_bind_b2MotorJointDef___destroy___0"] = asm["_emscripten_bind_b2MotorJointDef___destroy___0"];
var _emscripten_bind_b2FrictionJoint_GetNext_0 = Module["_emscripten_bind_b2FrictionJoint_GetNext_0"] = asm["_emscripten_bind_b2FrictionJoint_GetNext_0"];
var _emscripten_bind_b2Shape_set_m_type_1 = Module["_emscripten_bind_b2Shape_set_m_type_1"] = asm["_emscripten_bind_b2Shape_set_m_type_1"];
var _emscripten_bind_b2WheelJoint_GetJointTranslation_0 = Module["_emscripten_bind_b2WheelJoint_GetJointTranslation_0"] = asm["_emscripten_bind_b2WheelJoint_GetJointTranslation_0"];
var _emscripten_bind_b2WheelJoint_GetMotorTorque_1 = Module["_emscripten_bind_b2WheelJoint_GetMotorTorque_1"] = asm["_emscripten_bind_b2WheelJoint_GetMotorTorque_1"];
var _emscripten_bind_b2RopeJoint_SetUserData_1 = Module["_emscripten_bind_b2RopeJoint_SetUserData_1"] = asm["_emscripten_bind_b2RopeJoint_SetUserData_1"];
var _emscripten_bind_b2RopeJointDef___destroy___0 = Module["_emscripten_bind_b2RopeJointDef___destroy___0"] = asm["_emscripten_bind_b2RopeJointDef___destroy___0"];
var _emscripten_bind_b2WheelJoint_IsActive_0 = Module["_emscripten_bind_b2WheelJoint_IsActive_0"] = asm["_emscripten_bind_b2WheelJoint_IsActive_0"];
var _emscripten_bind_b2PrismaticJointDef_get_enableMotor_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_enableMotor_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_enableMotor_0"];
var _emscripten_bind_b2MotorJointDef_set_bodyB_1 = Module["_emscripten_bind_b2MotorJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2MotorJointDef_set_bodyB_1"];
var _emscripten_bind_JSDestructionListener___destroy___0 = Module["_emscripten_bind_JSDestructionListener___destroy___0"] = asm["_emscripten_bind_JSDestructionListener___destroy___0"];
var _emscripten_bind_b2Transform_b2Transform_2 = Module["_emscripten_bind_b2Transform_b2Transform_2"] = asm["_emscripten_bind_b2Transform_b2Transform_2"];
var _emscripten_bind_b2WeldJoint_GetReactionForce_1 = Module["_emscripten_bind_b2WeldJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2WeldJoint_GetReactionForce_1"];
var _emscripten_bind_b2ChainShape_RayCast_4 = Module["_emscripten_bind_b2ChainShape_RayCast_4"] = asm["_emscripten_bind_b2ChainShape_RayCast_4"];
var _emscripten_bind_b2Vec2_set_y_1 = Module["_emscripten_bind_b2Vec2_set_y_1"] = asm["_emscripten_bind_b2Vec2_set_y_1"];
var _emscripten_bind_b2PrismaticJoint_SetMotorSpeed_1 = Module["_emscripten_bind_b2PrismaticJoint_SetMotorSpeed_1"] = asm["_emscripten_bind_b2PrismaticJoint_SetMotorSpeed_1"];
var _emscripten_bind_b2ContactID_get_cf_0 = Module["_emscripten_bind_b2ContactID_get_cf_0"] = asm["_emscripten_bind_b2ContactID_get_cf_0"];
var _emscripten_bind_b2DistanceJointDef_Initialize_4 = Module["_emscripten_bind_b2DistanceJointDef_Initialize_4"] = asm["_emscripten_bind_b2DistanceJointDef_Initialize_4"];
var _emscripten_bind_b2ChainShape_get_m_radius_0 = Module["_emscripten_bind_b2ChainShape_get_m_radius_0"] = asm["_emscripten_bind_b2ChainShape_get_m_radius_0"];
var _emscripten_bind_b2WeldJointDef_set_localAnchorB_1 = Module["_emscripten_bind_b2WeldJointDef_set_localAnchorB_1"] = asm["_emscripten_bind_b2WeldJointDef_set_localAnchorB_1"];
var _emscripten_bind_b2ChainShape_set_m_radius_1 = Module["_emscripten_bind_b2ChainShape_set_m_radius_1"] = asm["_emscripten_bind_b2ChainShape_set_m_radius_1"];
var _emscripten_bind_b2DistanceJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2DistanceJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2DistanceJoint_GetReactionTorque_1"];
var _emscripten_bind_b2World_Dump_0 = Module["_emscripten_bind_b2World_Dump_0"] = asm["_emscripten_bind_b2World_Dump_0"];
var _emscripten_bind_b2RevoluteJoint_GetLocalAnchorB_0 = Module["_emscripten_bind_b2RevoluteJoint_GetLocalAnchorB_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetLocalAnchorB_0"];
var _emscripten_bind_JSContactFilter_JSContactFilter_0 = Module["_emscripten_bind_JSContactFilter_JSContactFilter_0"] = asm["_emscripten_bind_JSContactFilter_JSContactFilter_0"];
var _emscripten_bind_b2Profile_set_solve_1 = Module["_emscripten_bind_b2Profile_set_solve_1"] = asm["_emscripten_bind_b2Profile_set_solve_1"];
var _emscripten_bind_b2FixtureDef_set_density_1 = Module["_emscripten_bind_b2FixtureDef_set_density_1"] = asm["_emscripten_bind_b2FixtureDef_set_density_1"];
var _emscripten_bind_b2WeldJoint_GetDampingRatio_0 = Module["_emscripten_bind_b2WeldJoint_GetDampingRatio_0"] = asm["_emscripten_bind_b2WeldJoint_GetDampingRatio_0"];
var _emscripten_bind_b2Color_get_b_0 = Module["_emscripten_bind_b2Color_get_b_0"] = asm["_emscripten_bind_b2Color_get_b_0"];
var _emscripten_bind_b2MouseJointDef_get_userData_0 = Module["_emscripten_bind_b2MouseJointDef_get_userData_0"] = asm["_emscripten_bind_b2MouseJointDef_get_userData_0"];
var _emscripten_bind_b2CircleShape_ComputeAABB_3 = Module["_emscripten_bind_b2CircleShape_ComputeAABB_3"] = asm["_emscripten_bind_b2CircleShape_ComputeAABB_3"];
var _emscripten_bind_b2RopeJoint_GetReactionForce_1 = Module["_emscripten_bind_b2RopeJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2RopeJoint_GetReactionForce_1"];
var _emscripten_bind_b2PrismaticJointDef_get_enableLimit_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_enableLimit_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_enableLimit_0"];
var _emscripten_bind_b2ManifoldPoint_set_localPoint_1 = Module["_emscripten_bind_b2ManifoldPoint_set_localPoint_1"] = asm["_emscripten_bind_b2ManifoldPoint_set_localPoint_1"];
var _emscripten_bind_b2Fixture_GetFilterData_0 = Module["_emscripten_bind_b2Fixture_GetFilterData_0"] = asm["_emscripten_bind_b2Fixture_GetFilterData_0"];
var _emscripten_bind_b2World_GetBodyList_0 = Module["_emscripten_bind_b2World_GetBodyList_0"] = asm["_emscripten_bind_b2World_GetBodyList_0"];
var _emscripten_bind_b2Body_GetJointList_0 = Module["_emscripten_bind_b2Body_GetJointList_0"] = asm["_emscripten_bind_b2Body_GetJointList_0"];
var _emscripten_bind_b2Joint_GetNext_0 = Module["_emscripten_bind_b2Joint_GetNext_0"] = asm["_emscripten_bind_b2Joint_GetNext_0"];
var _emscripten_bind_b2Joint_GetType_0 = Module["_emscripten_bind_b2Joint_GetType_0"] = asm["_emscripten_bind_b2Joint_GetType_0"];
var _emscripten_bind_b2World_RayCast_3 = Module["_emscripten_bind_b2World_RayCast_3"] = asm["_emscripten_bind_b2World_RayCast_3"];
var _emscripten_bind_b2MassData_set_I_1 = Module["_emscripten_bind_b2MassData_set_I_1"] = asm["_emscripten_bind_b2MassData_set_I_1"];
var _emscripten_bind_b2MassData___destroy___0 = Module["_emscripten_bind_b2MassData___destroy___0"] = asm["_emscripten_bind_b2MassData___destroy___0"];
var _emscripten_bind_b2Profile_get_collide_0 = Module["_emscripten_bind_b2Profile_get_collide_0"] = asm["_emscripten_bind_b2Profile_get_collide_0"];
var _emscripten_bind_b2Color_b2Color_3 = Module["_emscripten_bind_b2Color_b2Color_3"] = asm["_emscripten_bind_b2Color_b2Color_3"];
var _emscripten_bind_b2Color_b2Color_0 = Module["_emscripten_bind_b2Color_b2Color_0"] = asm["_emscripten_bind_b2Color_b2Color_0"];
var _emscripten_bind_b2WheelJointDef_get_frequencyHz_0 = Module["_emscripten_bind_b2WheelJointDef_get_frequencyHz_0"] = asm["_emscripten_bind_b2WheelJointDef_get_frequencyHz_0"];
var _emscripten_bind_b2WeldJointDef_Initialize_3 = Module["_emscripten_bind_b2WeldJointDef_Initialize_3"] = asm["_emscripten_bind_b2WeldJointDef_Initialize_3"];
var _emscripten_bind_b2RevoluteJoint_GetMotorTorque_1 = Module["_emscripten_bind_b2RevoluteJoint_GetMotorTorque_1"] = asm["_emscripten_bind_b2RevoluteJoint_GetMotorTorque_1"];
var _emscripten_enum_b2JointType_e_gearJoint = Module["_emscripten_enum_b2JointType_e_gearJoint"] = asm["_emscripten_enum_b2JointType_e_gearJoint"];
var _emscripten_bind_b2FixtureDef_get_friction_0 = Module["_emscripten_bind_b2FixtureDef_get_friction_0"] = asm["_emscripten_bind_b2FixtureDef_get_friction_0"];
var _emscripten_bind_b2PrismaticJointDef_set_localAnchorA_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_localAnchorA_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_localAnchorA_1"];
var _emscripten_bind_b2Contact_GetManifold_0 = Module["_emscripten_bind_b2Contact_GetManifold_0"] = asm["_emscripten_bind_b2Contact_GetManifold_0"];
var _emscripten_bind_b2QueryCallback___destroy___0 = Module["_emscripten_bind_b2QueryCallback___destroy___0"] = asm["_emscripten_bind_b2QueryCallback___destroy___0"];
var _emscripten_bind_b2WeldJointDef_get_localAnchorA_0 = Module["_emscripten_bind_b2WeldJointDef_get_localAnchorA_0"] = asm["_emscripten_bind_b2WeldJointDef_get_localAnchorA_0"];
var _emscripten_bind_b2MouseJoint_SetUserData_1 = Module["_emscripten_bind_b2MouseJoint_SetUserData_1"] = asm["_emscripten_bind_b2MouseJoint_SetUserData_1"];
var _emscripten_bind_b2MotorJointDef_set_correctionFactor_1 = Module["_emscripten_bind_b2MotorJointDef_set_correctionFactor_1"] = asm["_emscripten_bind_b2MotorJointDef_set_correctionFactor_1"];
var _emscripten_bind_b2ChainShape_GetChildEdge_2 = Module["_emscripten_bind_b2ChainShape_GetChildEdge_2"] = asm["_emscripten_bind_b2ChainShape_GetChildEdge_2"];
var _emscripten_enum_b2JointType_e_mouseJoint = Module["_emscripten_enum_b2JointType_e_mouseJoint"] = asm["_emscripten_enum_b2JointType_e_mouseJoint"];
var _emscripten_bind_b2MotorJointDef_get_angularOffset_0 = Module["_emscripten_bind_b2MotorJointDef_get_angularOffset_0"] = asm["_emscripten_bind_b2MotorJointDef_get_angularOffset_0"];
var _emscripten_bind_b2WheelJoint_SetUserData_1 = Module["_emscripten_bind_b2WheelJoint_SetUserData_1"] = asm["_emscripten_bind_b2WheelJoint_SetUserData_1"];
var _emscripten_bind_b2Body_ApplyForce_3 = Module["_emscripten_bind_b2Body_ApplyForce_3"] = asm["_emscripten_bind_b2Body_ApplyForce_3"];
var _emscripten_bind_b2ChainShape_set_m_count_1 = Module["_emscripten_bind_b2ChainShape_set_m_count_1"] = asm["_emscripten_bind_b2ChainShape_set_m_count_1"];
var _emscripten_bind_b2DistanceJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2DistanceJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2DistanceJoint_GetCollideConnected_0"];
var _emscripten_bind_b2RevoluteJoint_IsMotorEnabled_0 = Module["_emscripten_bind_b2RevoluteJoint_IsMotorEnabled_0"] = asm["_emscripten_bind_b2RevoluteJoint_IsMotorEnabled_0"];
var _emscripten_bind_b2PolygonShape_GetVertex_1 = Module["_emscripten_bind_b2PolygonShape_GetVertex_1"] = asm["_emscripten_bind_b2PolygonShape_GetVertex_1"];
var _emscripten_bind_b2World_SetGravity_1 = Module["_emscripten_bind_b2World_SetGravity_1"] = asm["_emscripten_bind_b2World_SetGravity_1"];
var _emscripten_bind_b2MouseJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2MouseJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2MouseJointDef_get_collideConnected_0"];
var _emscripten_bind_b2Contact_GetChildIndexA_0 = Module["_emscripten_bind_b2Contact_GetChildIndexA_0"] = asm["_emscripten_bind_b2Contact_GetChildIndexA_0"];
var _emscripten_bind_b2Fixture_SetRestitution_1 = Module["_emscripten_bind_b2Fixture_SetRestitution_1"] = asm["_emscripten_bind_b2Fixture_SetRestitution_1"];
var _emscripten_bind_b2Body_GetTransform_0 = Module["_emscripten_bind_b2Body_GetTransform_0"] = asm["_emscripten_bind_b2Body_GetTransform_0"];
var _emscripten_enum_b2ShapeType_e_typeCount = Module["_emscripten_enum_b2ShapeType_e_typeCount"] = asm["_emscripten_enum_b2ShapeType_e_typeCount"];
var _emscripten_bind_b2Mat33_set_ex_1 = Module["_emscripten_bind_b2Mat33_set_ex_1"] = asm["_emscripten_bind_b2Mat33_set_ex_1"];
var _emscripten_bind_b2PulleyJointDef_get_localAnchorB_0 = Module["_emscripten_bind_b2PulleyJointDef_get_localAnchorB_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_localAnchorB_0"];
var _emscripten_bind_b2RevoluteJointDef_get_bodyA_0 = Module["_emscripten_bind_b2RevoluteJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2RevoluteJointDef_get_bodyA_0"];
var _emscripten_bind_b2PrismaticJoint_GetBodyB_0 = Module["_emscripten_bind_b2PrismaticJoint_GetBodyB_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetBodyB_0"];
var _emscripten_bind_b2WheelJointDef_set_bodyA_1 = Module["_emscripten_bind_b2WheelJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2WheelJointDef_set_bodyA_1"];
var _emscripten_bind_b2MotorJointDef_set_maxForce_1 = Module["_emscripten_bind_b2MotorJointDef_set_maxForce_1"] = asm["_emscripten_bind_b2MotorJointDef_set_maxForce_1"];
var _emscripten_bind_b2BodyDef_get_angle_0 = Module["_emscripten_bind_b2BodyDef_get_angle_0"] = asm["_emscripten_bind_b2BodyDef_get_angle_0"];
var _emscripten_bind_b2FixtureDef_get_shape_0 = Module["_emscripten_bind_b2FixtureDef_get_shape_0"] = asm["_emscripten_bind_b2FixtureDef_get_shape_0"];
var _emscripten_bind_b2Body_SetAngularVelocity_1 = Module["_emscripten_bind_b2Body_SetAngularVelocity_1"] = asm["_emscripten_bind_b2Body_SetAngularVelocity_1"];
var _emscripten_bind_b2WeldJointDef_get_userData_0 = Module["_emscripten_bind_b2WeldJointDef_get_userData_0"] = asm["_emscripten_bind_b2WeldJointDef_get_userData_0"];
var _emscripten_bind_b2FrictionJoint_SetMaxForce_1 = Module["_emscripten_bind_b2FrictionJoint_SetMaxForce_1"] = asm["_emscripten_bind_b2FrictionJoint_SetMaxForce_1"];
var _emscripten_bind_b2Mat33_b2Mat33_3 = Module["_emscripten_bind_b2Mat33_b2Mat33_3"] = asm["_emscripten_bind_b2Mat33_b2Mat33_3"];
var _emscripten_bind_b2Vec3_get_y_0 = Module["_emscripten_bind_b2Vec3_get_y_0"] = asm["_emscripten_bind_b2Vec3_get_y_0"];
var _emscripten_bind_b2JointDef_get_type_0 = Module["_emscripten_bind_b2JointDef_get_type_0"] = asm["_emscripten_bind_b2JointDef_get_type_0"];
var _emscripten_bind_JSQueryCallback_ReportFixture_1 = Module["_emscripten_bind_JSQueryCallback_ReportFixture_1"] = asm["_emscripten_bind_JSQueryCallback_ReportFixture_1"];
var _emscripten_bind_b2PulleyJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2PulleyJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2PulleyJoint_GetCollideConnected_0"];
var _emscripten_bind_b2Body_CreateFixture_1 = Module["_emscripten_bind_b2Body_CreateFixture_1"] = asm["_emscripten_bind_b2Body_CreateFixture_1"];
var _emscripten_bind_JSDraw_JSDraw_0 = Module["_emscripten_bind_JSDraw_JSDraw_0"] = asm["_emscripten_bind_JSDraw_JSDraw_0"];
var _emscripten_bind_b2MouseJoint_GetAnchorA_0 = Module["_emscripten_bind_b2MouseJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2MouseJoint_GetAnchorA_0"];
var _emscripten_bind_b2Transform_get_p_0 = Module["_emscripten_bind_b2Transform_get_p_0"] = asm["_emscripten_bind_b2Transform_get_p_0"];
var _emscripten_enum_b2BodyType_b2_dynamicBody = Module["_emscripten_enum_b2BodyType_b2_dynamicBody"] = asm["_emscripten_enum_b2BodyType_b2_dynamicBody"];
var _emscripten_bind_b2World_GetProfile_0 = Module["_emscripten_bind_b2World_GetProfile_0"] = asm["_emscripten_bind_b2World_GetProfile_0"];
var _emscripten_bind_b2DistanceJointDef___destroy___0 = Module["_emscripten_bind_b2DistanceJointDef___destroy___0"] = asm["_emscripten_bind_b2DistanceJointDef___destroy___0"];
var _emscripten_bind_b2GearJointDef_set_bodyA_1 = Module["_emscripten_bind_b2GearJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2GearJointDef_set_bodyA_1"];
var _emscripten_bind_b2JointDef_set_type_1 = Module["_emscripten_bind_b2JointDef_set_type_1"] = asm["_emscripten_bind_b2JointDef_set_type_1"];
var _emscripten_bind_b2ContactEdge_set_contact_1 = Module["_emscripten_bind_b2ContactEdge_set_contact_1"] = asm["_emscripten_bind_b2ContactEdge_set_contact_1"];
var _emscripten_bind_b2MotorJointDef_get_userData_0 = Module["_emscripten_bind_b2MotorJointDef_get_userData_0"] = asm["_emscripten_bind_b2MotorJointDef_get_userData_0"];
var _emscripten_bind_b2World_GetContactList_0 = Module["_emscripten_bind_b2World_GetContactList_0"] = asm["_emscripten_bind_b2World_GetContactList_0"];
var _emscripten_bind_b2Mat33_set_ez_1 = Module["_emscripten_bind_b2Mat33_set_ez_1"] = asm["_emscripten_bind_b2Mat33_set_ez_1"];
var _emscripten_bind_b2JointEdge_b2JointEdge_0 = Module["_emscripten_bind_b2JointEdge_b2JointEdge_0"] = asm["_emscripten_bind_b2JointEdge_b2JointEdge_0"];
var _emscripten_bind_b2FrictionJointDef_get_bodyA_0 = Module["_emscripten_bind_b2FrictionJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2FrictionJointDef_get_bodyA_0"];
var _emscripten_bind_b2WheelJointDef_get_type_0 = Module["_emscripten_bind_b2WheelJointDef_get_type_0"] = asm["_emscripten_bind_b2WheelJointDef_get_type_0"];
var _emscripten_bind_b2RevoluteJoint_GetReactionForce_1 = Module["_emscripten_bind_b2RevoluteJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2RevoluteJoint_GetReactionForce_1"];
var _emscripten_bind_b2PulleyJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2PulleyJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_collideConnected_1"];
var _emscripten_bind_b2RopeJoint_GetCollideConnected_0 = Module["_emscripten_bind_b2RopeJoint_GetCollideConnected_0"] = asm["_emscripten_bind_b2RopeJoint_GetCollideConnected_0"];
var _emscripten_bind_b2GearJointDef_set_joint2_1 = Module["_emscripten_bind_b2GearJointDef_set_joint2_1"] = asm["_emscripten_bind_b2GearJointDef_set_joint2_1"];
var _emscripten_bind_b2EdgeShape_set_m_vertex3_1 = Module["_emscripten_bind_b2EdgeShape_set_m_vertex3_1"] = asm["_emscripten_bind_b2EdgeShape_set_m_vertex3_1"];
var _emscripten_bind_b2GearJoint_GetAnchorB_0 = Module["_emscripten_bind_b2GearJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2GearJoint_GetAnchorB_0"];
var _emscripten_bind_b2RopeJoint_IsActive_0 = Module["_emscripten_bind_b2RopeJoint_IsActive_0"] = asm["_emscripten_bind_b2RopeJoint_IsActive_0"];
var _emscripten_bind_b2Fixture_GetFriction_0 = Module["_emscripten_bind_b2Fixture_GetFriction_0"] = asm["_emscripten_bind_b2Fixture_GetFriction_0"];
var _emscripten_bind_b2Fixture_GetNext_0 = Module["_emscripten_bind_b2Fixture_GetNext_0"] = asm["_emscripten_bind_b2Fixture_GetNext_0"];
var _emscripten_bind_b2RopeJointDef_get_bodyA_0 = Module["_emscripten_bind_b2RopeJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2RopeJointDef_get_bodyA_0"];
var _emscripten_bind_b2WeldJointDef_get_localAnchorB_0 = Module["_emscripten_bind_b2WeldJointDef_get_localAnchorB_0"] = asm["_emscripten_bind_b2WeldJointDef_get_localAnchorB_0"];
var _emscripten_bind_b2WeldJointDef_set_referenceAngle_1 = Module["_emscripten_bind_b2WeldJointDef_set_referenceAngle_1"] = asm["_emscripten_bind_b2WeldJointDef_set_referenceAngle_1"];
var _emscripten_bind_b2DistanceJointDef_set_localAnchorB_1 = Module["_emscripten_bind_b2DistanceJointDef_set_localAnchorB_1"] = asm["_emscripten_bind_b2DistanceJointDef_set_localAnchorB_1"];
var _emscripten_bind_b2Mat33_SetZero_0 = Module["_emscripten_bind_b2Mat33_SetZero_0"] = asm["_emscripten_bind_b2Mat33_SetZero_0"];
var _emscripten_bind_b2MotorJointDef_get_bodyB_0 = Module["_emscripten_bind_b2MotorJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2MotorJointDef_get_bodyB_0"];
var _emscripten_bind_b2WheelJointDef_b2WheelJointDef_0 = Module["_emscripten_bind_b2WheelJointDef_b2WheelJointDef_0"] = asm["_emscripten_bind_b2WheelJointDef_b2WheelJointDef_0"];
var _emscripten_bind_b2PrismaticJointDef_get_localAxisA_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_localAxisA_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_localAxisA_0"];
var _emscripten_bind_b2Mat22_get_ey_0 = Module["_emscripten_bind_b2Mat22_get_ey_0"] = asm["_emscripten_bind_b2Mat22_get_ey_0"];
var _emscripten_bind_b2Mat22_SetIdentity_0 = Module["_emscripten_bind_b2Mat22_SetIdentity_0"] = asm["_emscripten_bind_b2Mat22_SetIdentity_0"];
var _emscripten_bind_b2Joint_IsActive_0 = Module["_emscripten_bind_b2Joint_IsActive_0"] = asm["_emscripten_bind_b2Joint_IsActive_0"];
var _emscripten_bind_b2PulleyJoint_GetReactionForce_1 = Module["_emscripten_bind_b2PulleyJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2PulleyJoint_GetReactionForce_1"];
var _emscripten_bind_b2Shape_get_m_radius_0 = Module["_emscripten_bind_b2Shape_get_m_radius_0"] = asm["_emscripten_bind_b2Shape_get_m_radius_0"];
var _emscripten_bind_b2Mat22_b2Mat22_4 = Module["_emscripten_bind_b2Mat22_b2Mat22_4"] = asm["_emscripten_bind_b2Mat22_b2Mat22_4"];
var _emscripten_bind_b2PrismaticJointDef_set_localAxisA_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_localAxisA_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_localAxisA_1"];
var _emscripten_bind_b2PolygonShape_SetAsBox_4 = Module["_emscripten_bind_b2PolygonShape_SetAsBox_4"] = asm["_emscripten_bind_b2PolygonShape_SetAsBox_4"];
var _emscripten_bind_b2EdgeShape_set_m_vertex1_1 = Module["_emscripten_bind_b2EdgeShape_set_m_vertex1_1"] = asm["_emscripten_bind_b2EdgeShape_set_m_vertex1_1"];
var _emscripten_bind_b2Body_GetWorld_0 = Module["_emscripten_bind_b2Body_GetWorld_0"] = asm["_emscripten_bind_b2Body_GetWorld_0"];
var _emscripten_enum_b2LimitState_e_inactiveLimit = Module["_emscripten_enum_b2LimitState_e_inactiveLimit"] = asm["_emscripten_enum_b2LimitState_e_inactiveLimit"];
var _emscripten_bind_b2Vec2_set_x_1 = Module["_emscripten_bind_b2Vec2_set_x_1"] = asm["_emscripten_bind_b2Vec2_set_x_1"];
var _emscripten_bind_b2Body_SetAwake_1 = Module["_emscripten_bind_b2Body_SetAwake_1"] = asm["_emscripten_bind_b2Body_SetAwake_1"];
var _emscripten_bind_b2WeldJoint_GetLocalAnchorA_0 = Module["_emscripten_bind_b2WeldJoint_GetLocalAnchorA_0"] = asm["_emscripten_bind_b2WeldJoint_GetLocalAnchorA_0"];
var _emscripten_bind_b2Vec2___destroy___0 = Module["_emscripten_bind_b2Vec2___destroy___0"] = asm["_emscripten_bind_b2Vec2___destroy___0"];
var _emscripten_enum_b2ShapeType_e_polygon = Module["_emscripten_enum_b2ShapeType_e_polygon"] = asm["_emscripten_enum_b2ShapeType_e_polygon"];
var _emscripten_bind_b2Body_GetInertia_0 = Module["_emscripten_bind_b2Body_GetInertia_0"] = asm["_emscripten_bind_b2Body_GetInertia_0"];
var _emscripten_bind_b2PulleyJoint_GetAnchorA_0 = Module["_emscripten_bind_b2PulleyJoint_GetAnchorA_0"] = asm["_emscripten_bind_b2PulleyJoint_GetAnchorA_0"];
var _emscripten_bind_b2BodyDef_get_linearVelocity_0 = Module["_emscripten_bind_b2BodyDef_get_linearVelocity_0"] = asm["_emscripten_bind_b2BodyDef_get_linearVelocity_0"];
var _emscripten_bind_b2DistanceJointDef_get_bodyB_0 = Module["_emscripten_bind_b2DistanceJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2DistanceJointDef_get_bodyB_0"];
var _emscripten_bind_b2Mat22___destroy___0 = Module["_emscripten_bind_b2Mat22___destroy___0"] = asm["_emscripten_bind_b2Mat22___destroy___0"];
var _emscripten_bind_b2RevoluteJoint_GetNext_0 = Module["_emscripten_bind_b2RevoluteJoint_GetNext_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetNext_0"];
var _emscripten_bind_b2WeldJointDef_get_bodyA_0 = Module["_emscripten_bind_b2WeldJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2WeldJointDef_get_bodyA_0"];
var _emscripten_bind_b2MotorJoint_GetAnchorB_0 = Module["_emscripten_bind_b2MotorJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2MotorJoint_GetAnchorB_0"];
var _emscripten_bind_b2Fixture_GetShape_0 = Module["_emscripten_bind_b2Fixture_GetShape_0"] = asm["_emscripten_bind_b2Fixture_GetShape_0"];
var _emscripten_bind_b2PulleyJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2PulleyJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2PulleyJoint_GetReactionTorque_1"];
var _emscripten_bind_b2Vec3_op_mul_1 = Module["_emscripten_bind_b2Vec3_op_mul_1"] = asm["_emscripten_bind_b2Vec3_op_mul_1"];
var _emscripten_bind_b2PolygonShape_set_m_type_1 = Module["_emscripten_bind_b2PolygonShape_set_m_type_1"] = asm["_emscripten_bind_b2PolygonShape_set_m_type_1"];
var _emscripten_bind_b2WheelJoint_GetType_0 = Module["_emscripten_bind_b2WheelJoint_GetType_0"] = asm["_emscripten_bind_b2WheelJoint_GetType_0"];
var _emscripten_bind_b2MotorJoint_GetAngularOffset_0 = Module["_emscripten_bind_b2MotorJoint_GetAngularOffset_0"] = asm["_emscripten_bind_b2MotorJoint_GetAngularOffset_0"];
var _emscripten_bind_b2RevoluteJoint_IsActive_0 = Module["_emscripten_bind_b2RevoluteJoint_IsActive_0"] = asm["_emscripten_bind_b2RevoluteJoint_IsActive_0"];
var _emscripten_bind_b2GearJoint_GetNext_0 = Module["_emscripten_bind_b2GearJoint_GetNext_0"] = asm["_emscripten_bind_b2GearJoint_GetNext_0"];
var _emscripten_bind_b2MouseJointDef_get_maxForce_0 = Module["_emscripten_bind_b2MouseJointDef_get_maxForce_0"] = asm["_emscripten_bind_b2MouseJointDef_get_maxForce_0"];
var _emscripten_bind_b2DestructionListenerWrapper___destroy___0 = Module["_emscripten_bind_b2DestructionListenerWrapper___destroy___0"] = asm["_emscripten_bind_b2DestructionListenerWrapper___destroy___0"];
var _emscripten_bind_b2PrismaticJointDef_set_maxMotorForce_1 = Module["_emscripten_bind_b2PrismaticJointDef_set_maxMotorForce_1"] = asm["_emscripten_bind_b2PrismaticJointDef_set_maxMotorForce_1"];
var _emscripten_bind_b2WheelJoint_GetLocalAxisA_0 = Module["_emscripten_bind_b2WheelJoint_GetLocalAxisA_0"] = asm["_emscripten_bind_b2WheelJoint_GetLocalAxisA_0"];
var _emscripten_bind_b2Body_GetNext_0 = Module["_emscripten_bind_b2Body_GetNext_0"] = asm["_emscripten_bind_b2Body_GetNext_0"];
var _emscripten_bind_b2MouseJoint_GetReactionForce_1 = Module["_emscripten_bind_b2MouseJoint_GetReactionForce_1"] = asm["_emscripten_bind_b2MouseJoint_GetReactionForce_1"];
var _emscripten_bind_b2RopeJoint_GetBodyA_0 = Module["_emscripten_bind_b2RopeJoint_GetBodyA_0"] = asm["_emscripten_bind_b2RopeJoint_GetBodyA_0"];
var _emscripten_bind_b2ContactFeature_set_indexA_1 = Module["_emscripten_bind_b2ContactFeature_set_indexA_1"] = asm["_emscripten_bind_b2ContactFeature_set_indexA_1"];
var _emscripten_bind_b2Profile_get_solveInit_0 = Module["_emscripten_bind_b2Profile_get_solveInit_0"] = asm["_emscripten_bind_b2Profile_get_solveInit_0"];
var _emscripten_bind_b2Fixture_IsSensor_0 = Module["_emscripten_bind_b2Fixture_IsSensor_0"] = asm["_emscripten_bind_b2Fixture_IsSensor_0"];
var _emscripten_bind_b2FrictionJoint_GetAnchorB_0 = Module["_emscripten_bind_b2FrictionJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2FrictionJoint_GetAnchorB_0"];
var _emscripten_bind_b2World_QueryAABB_2 = Module["_emscripten_bind_b2World_QueryAABB_2"] = asm["_emscripten_bind_b2World_QueryAABB_2"];
var _emscripten_bind_b2Profile_set_collide_1 = Module["_emscripten_bind_b2Profile_set_collide_1"] = asm["_emscripten_bind_b2Profile_set_collide_1"];
var _emscripten_bind_b2BodyDef_get_userData_0 = Module["_emscripten_bind_b2BodyDef_get_userData_0"] = asm["_emscripten_bind_b2BodyDef_get_userData_0"];
var _emscripten_bind_b2MotorJoint_SetLinearOffset_1 = Module["_emscripten_bind_b2MotorJoint_SetLinearOffset_1"] = asm["_emscripten_bind_b2MotorJoint_SetLinearOffset_1"];
var _emscripten_bind_b2FrictionJoint_GetMaxForce_0 = Module["_emscripten_bind_b2FrictionJoint_GetMaxForce_0"] = asm["_emscripten_bind_b2FrictionJoint_GetMaxForce_0"];
var _emscripten_bind_b2WheelJointDef_get_userData_0 = Module["_emscripten_bind_b2WheelJointDef_get_userData_0"] = asm["_emscripten_bind_b2WheelJointDef_get_userData_0"];
var _emscripten_bind_b2RevoluteJoint_IsLimitEnabled_0 = Module["_emscripten_bind_b2RevoluteJoint_IsLimitEnabled_0"] = asm["_emscripten_bind_b2RevoluteJoint_IsLimitEnabled_0"];
var _emscripten_bind_b2World_SetDestructionListener_1 = Module["_emscripten_bind_b2World_SetDestructionListener_1"] = asm["_emscripten_bind_b2World_SetDestructionListener_1"];
var _emscripten_bind_b2RevoluteJointDef_set_maxMotorTorque_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_maxMotorTorque_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_maxMotorTorque_1"];
var _emscripten_bind_b2WeldJointDef_set_bodyB_1 = Module["_emscripten_bind_b2WeldJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2WeldJointDef_set_bodyB_1"];
var _emscripten_bind_b2Transform_set_p_1 = Module["_emscripten_bind_b2Transform_set_p_1"] = asm["_emscripten_bind_b2Transform_set_p_1"];
var _emscripten_bind_b2DistanceJoint_SetLength_1 = Module["_emscripten_bind_b2DistanceJoint_SetLength_1"] = asm["_emscripten_bind_b2DistanceJoint_SetLength_1"];
var _emscripten_bind_b2ManifoldPoint_get_localPoint_0 = Module["_emscripten_bind_b2ManifoldPoint_get_localPoint_0"] = asm["_emscripten_bind_b2ManifoldPoint_get_localPoint_0"];
var _emscripten_bind_b2JointEdge_get_joint_0 = Module["_emscripten_bind_b2JointEdge_get_joint_0"] = asm["_emscripten_bind_b2JointEdge_get_joint_0"];
var _emscripten_bind_b2Body_GetLocalCenter_0 = Module["_emscripten_bind_b2Body_GetLocalCenter_0"] = asm["_emscripten_bind_b2Body_GetLocalCenter_0"];
var _emscripten_bind_b2FixtureDef___destroy___0 = Module["_emscripten_bind_b2FixtureDef___destroy___0"] = asm["_emscripten_bind_b2FixtureDef___destroy___0"];
var _emscripten_bind_b2MouseJoint___destroy___0 = Module["_emscripten_bind_b2MouseJoint___destroy___0"] = asm["_emscripten_bind_b2MouseJoint___destroy___0"];
var _emscripten_enum_b2JointType_e_ropeJoint = Module["_emscripten_enum_b2JointType_e_ropeJoint"] = asm["_emscripten_enum_b2JointType_e_ropeJoint"];
var _emscripten_bind_b2Profile_get_solveVelocity_0 = Module["_emscripten_bind_b2Profile_get_solveVelocity_0"] = asm["_emscripten_bind_b2Profile_get_solveVelocity_0"];
var _emscripten_bind_b2WeldJointDef_get_bodyB_0 = Module["_emscripten_bind_b2WeldJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2WeldJointDef_get_bodyB_0"];
var _emscripten_bind_b2World_GetContinuousPhysics_0 = Module["_emscripten_bind_b2World_GetContinuousPhysics_0"] = asm["_emscripten_bind_b2World_GetContinuousPhysics_0"];
var _emscripten_bind_b2Joint_GetBodyA_0 = Module["_emscripten_bind_b2Joint_GetBodyA_0"] = asm["_emscripten_bind_b2Joint_GetBodyA_0"];
var _emscripten_bind_b2MotorJointDef_set_maxTorque_1 = Module["_emscripten_bind_b2MotorJointDef_set_maxTorque_1"] = asm["_emscripten_bind_b2MotorJointDef_set_maxTorque_1"];
var _emscripten_bind_b2PulleyJointDef_Initialize_7 = Module["_emscripten_bind_b2PulleyJointDef_Initialize_7"] = asm["_emscripten_bind_b2PulleyJointDef_Initialize_7"];
var _emscripten_bind_b2GearJointDef_set_bodyB_1 = Module["_emscripten_bind_b2GearJointDef_set_bodyB_1"] = asm["_emscripten_bind_b2GearJointDef_set_bodyB_1"];
var _emscripten_bind_b2RopeJoint_GetReactionTorque_1 = Module["_emscripten_bind_b2RopeJoint_GetReactionTorque_1"] = asm["_emscripten_bind_b2RopeJoint_GetReactionTorque_1"];
var _emscripten_bind_b2WheelJointDef_set_dampingRatio_1 = Module["_emscripten_bind_b2WheelJointDef_set_dampingRatio_1"] = asm["_emscripten_bind_b2WheelJointDef_set_dampingRatio_1"];
var _emscripten_bind_b2GearJoint_GetType_0 = Module["_emscripten_bind_b2GearJoint_GetType_0"] = asm["_emscripten_bind_b2GearJoint_GetType_0"];
var _emscripten_bind_b2MotorJoint_GetNext_0 = Module["_emscripten_bind_b2MotorJoint_GetNext_0"] = asm["_emscripten_bind_b2MotorJoint_GetNext_0"];
var _emscripten_bind_b2EdgeShape_set_m_vertex0_1 = Module["_emscripten_bind_b2EdgeShape_set_m_vertex0_1"] = asm["_emscripten_bind_b2EdgeShape_set_m_vertex0_1"];
var _emscripten_bind_b2RevoluteJoint_GetAnchorB_0 = Module["_emscripten_bind_b2RevoluteJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2RevoluteJoint_GetAnchorB_0"];
var _emscripten_bind_b2RopeJointDef_set_localAnchorB_1 = Module["_emscripten_bind_b2RopeJointDef_set_localAnchorB_1"] = asm["_emscripten_bind_b2RopeJointDef_set_localAnchorB_1"];
var _emscripten_bind_b2PrismaticJoint_GetUserData_0 = Module["_emscripten_bind_b2PrismaticJoint_GetUserData_0"] = asm["_emscripten_bind_b2PrismaticJoint_GetUserData_0"];
var _emscripten_bind_b2GearJointDef_set_userData_1 = Module["_emscripten_bind_b2GearJointDef_set_userData_1"] = asm["_emscripten_bind_b2GearJointDef_set_userData_1"];
var _emscripten_bind_b2Fixture_SetSensor_1 = Module["_emscripten_bind_b2Fixture_SetSensor_1"] = asm["_emscripten_bind_b2Fixture_SetSensor_1"];
var _emscripten_bind_b2MotorJointDef_set_collideConnected_1 = Module["_emscripten_bind_b2MotorJointDef_set_collideConnected_1"] = asm["_emscripten_bind_b2MotorJointDef_set_collideConnected_1"];
var _emscripten_bind_b2Contact_GetFixtureB_0 = Module["_emscripten_bind_b2Contact_GetFixtureB_0"] = asm["_emscripten_bind_b2Contact_GetFixtureB_0"];
var _emscripten_bind_b2ChainShape_ComputeMass_2 = Module["_emscripten_bind_b2ChainShape_ComputeMass_2"] = asm["_emscripten_bind_b2ChainShape_ComputeMass_2"];
var _emscripten_bind_b2WeldJointDef_b2WeldJointDef_0 = Module["_emscripten_bind_b2WeldJointDef_b2WeldJointDef_0"] = asm["_emscripten_bind_b2WeldJointDef_b2WeldJointDef_0"];
var _emscripten_bind_b2PrismaticJoint_IsLimitEnabled_0 = Module["_emscripten_bind_b2PrismaticJoint_IsLimitEnabled_0"] = asm["_emscripten_bind_b2PrismaticJoint_IsLimitEnabled_0"];
var _emscripten_bind_b2RopeJointDef_get_bodyB_0 = Module["_emscripten_bind_b2RopeJointDef_get_bodyB_0"] = asm["_emscripten_bind_b2RopeJointDef_get_bodyB_0"];
var _emscripten_bind_b2BodyDef_b2BodyDef_0 = Module["_emscripten_bind_b2BodyDef_b2BodyDef_0"] = asm["_emscripten_bind_b2BodyDef_b2BodyDef_0"];
var _emscripten_bind_b2MassData_get_mass_0 = Module["_emscripten_bind_b2MassData_get_mass_0"] = asm["_emscripten_bind_b2MassData_get_mass_0"];
var _emscripten_bind_b2Joint_SetUserData_1 = Module["_emscripten_bind_b2Joint_SetUserData_1"] = asm["_emscripten_bind_b2Joint_SetUserData_1"];
var _emscripten_bind_b2Joint_GetBodyB_0 = Module["_emscripten_bind_b2Joint_GetBodyB_0"] = asm["_emscripten_bind_b2Joint_GetBodyB_0"];
var _emscripten_bind_b2Shape_GetChildCount_0 = Module["_emscripten_bind_b2Shape_GetChildCount_0"] = asm["_emscripten_bind_b2Shape_GetChildCount_0"];
var _emscripten_bind_b2WheelJointDef_set_localAxisA_1 = Module["_emscripten_bind_b2WheelJointDef_set_localAxisA_1"] = asm["_emscripten_bind_b2WheelJointDef_set_localAxisA_1"];
var _emscripten_bind_b2Joint_Dump_0 = Module["_emscripten_bind_b2Joint_Dump_0"] = asm["_emscripten_bind_b2Joint_Dump_0"];
var _emscripten_bind_b2Color_get_r_0 = Module["_emscripten_bind_b2Color_get_r_0"] = asm["_emscripten_bind_b2Color_get_r_0"];
var _emscripten_bind_b2RevoluteJointDef_set_motorSpeed_1 = Module["_emscripten_bind_b2RevoluteJointDef_set_motorSpeed_1"] = asm["_emscripten_bind_b2RevoluteJointDef_set_motorSpeed_1"];
var _emscripten_bind_b2MotorJointDef_get_bodyA_0 = Module["_emscripten_bind_b2MotorJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2MotorJointDef_get_bodyA_0"];
var _emscripten_bind_b2WheelJointDef_get_enableMotor_0 = Module["_emscripten_bind_b2WheelJointDef_get_enableMotor_0"] = asm["_emscripten_bind_b2WheelJointDef_get_enableMotor_0"];
var _emscripten_bind_b2Vec2_LengthSquared_0 = Module["_emscripten_bind_b2Vec2_LengthSquared_0"] = asm["_emscripten_bind_b2Vec2_LengthSquared_0"];
var _emscripten_bind_b2FrictionJointDef_set_bodyA_1 = Module["_emscripten_bind_b2FrictionJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2FrictionJointDef_set_bodyA_1"];
var _emscripten_bind_b2WheelJoint_GetSpringFrequencyHz_0 = Module["_emscripten_bind_b2WheelJoint_GetSpringFrequencyHz_0"] = asm["_emscripten_bind_b2WheelJoint_GetSpringFrequencyHz_0"];
var _emscripten_bind_b2ContactEdge_set_prev_1 = Module["_emscripten_bind_b2ContactEdge_set_prev_1"] = asm["_emscripten_bind_b2ContactEdge_set_prev_1"];
var _emscripten_bind_b2Shape_ComputeMass_2 = Module["_emscripten_bind_b2Shape_ComputeMass_2"] = asm["_emscripten_bind_b2Shape_ComputeMass_2"];
var _emscripten_bind_b2FrictionJoint_GetBodyA_0 = Module["_emscripten_bind_b2FrictionJoint_GetBodyA_0"] = asm["_emscripten_bind_b2FrictionJoint_GetBodyA_0"];
var _emscripten_bind_b2WheelJointDef_set_localAnchorB_1 = Module["_emscripten_bind_b2WheelJointDef_set_localAnchorB_1"] = asm["_emscripten_bind_b2WheelJointDef_set_localAnchorB_1"];
var _emscripten_bind_b2Body_GetAngle_0 = Module["_emscripten_bind_b2Body_GetAngle_0"] = asm["_emscripten_bind_b2Body_GetAngle_0"];
var _emscripten_bind_b2PrismaticJointDef_get_maxMotorForce_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_maxMotorForce_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_maxMotorForce_0"];
var _emscripten_bind_b2DistanceJoint_GetBodyA_0 = Module["_emscripten_bind_b2DistanceJoint_GetBodyA_0"] = asm["_emscripten_bind_b2DistanceJoint_GetBodyA_0"];
var _emscripten_bind_b2WheelJoint_GetLocalAnchorB_0 = Module["_emscripten_bind_b2WheelJoint_GetLocalAnchorB_0"] = asm["_emscripten_bind_b2WheelJoint_GetLocalAnchorB_0"];
var _emscripten_bind_b2PulleyJointDef_set_bodyA_1 = Module["_emscripten_bind_b2PulleyJointDef_set_bodyA_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_bodyA_1"];
var _emscripten_bind_b2WheelJoint_GetAnchorB_0 = Module["_emscripten_bind_b2WheelJoint_GetAnchorB_0"] = asm["_emscripten_bind_b2WheelJoint_GetAnchorB_0"];
var _emscripten_bind_b2PolygonShape_SetAsBox_2 = Module["_emscripten_bind_b2PolygonShape_SetAsBox_2"] = asm["_emscripten_bind_b2PolygonShape_SetAsBox_2"];
var _emscripten_bind_b2PrismaticJointDef_get_type_0 = Module["_emscripten_bind_b2PrismaticJointDef_get_type_0"] = asm["_emscripten_bind_b2PrismaticJointDef_get_type_0"];
var _emscripten_bind_b2Color_Set_3 = Module["_emscripten_bind_b2Color_Set_3"] = asm["_emscripten_bind_b2Color_Set_3"];
var _emscripten_bind_b2WheelJointDef_get_bodyA_0 = Module["_emscripten_bind_b2WheelJointDef_get_bodyA_0"] = asm["_emscripten_bind_b2WheelJointDef_get_bodyA_0"];
var _emscripten_enum_b2LimitState_e_atUpperLimit = Module["_emscripten_enum_b2LimitState_e_atUpperLimit"] = asm["_emscripten_enum_b2LimitState_e_atUpperLimit"];
var _emscripten_bind_b2PulleyJointDef_set_groundAnchorA_1 = Module["_emscripten_bind_b2PulleyJointDef_set_groundAnchorA_1"] = asm["_emscripten_bind_b2PulleyJointDef_set_groundAnchorA_1"];
var _emscripten_bind_b2PolygonShape_get_m_type_0 = Module["_emscripten_bind_b2PolygonShape_get_m_type_0"] = asm["_emscripten_bind_b2PolygonShape_get_m_type_0"];
var _emscripten_bind_b2PrismaticJoint_SetMaxMotorForce_1 = Module["_emscripten_bind_b2PrismaticJoint_SetMaxMotorForce_1"] = asm["_emscripten_bind_b2PrismaticJoint_SetMaxMotorForce_1"];
var _emscripten_bind_b2PulleyJointDef_get_collideConnected_0 = Module["_emscripten_bind_b2PulleyJointDef_get_collideConnected_0"] = asm["_emscripten_bind_b2PulleyJointDef_get_collideConnected_0"];
var _emscripten_bind_JSContactListener_JSContactListener_0 = Module["_emscripten_bind_JSContactListener_JSContactListener_0"] = asm["_emscripten_bind_JSContactListener_JSContactListener_0"];
var _emscripten_bind_b2WheelJoint___destroy___0 = Module["_emscripten_bind_b2WheelJoint___destroy___0"] = asm["_emscripten_bind_b2WheelJoint___destroy___0"];
var _emscripten_bind_b2PolygonShape_set_m_radius_1 = Module["_emscripten_bind_b2PolygonShape_set_m_radius_1"] = asm["_emscripten_bind_b2PolygonShape_set_m_radius_1"];
var _emscripten_bind_b2Fixture_GetMassData_1 = Module["_emscripten_bind_b2Fixture_GetMassData_1"] = asm["_emscripten_bind_b2Fixture_GetMassData_1"];
var _emscripten_bind_b2RopeJoint_SetMaxLength_1 = Module["_emscripten_bind_b2RopeJoint_SetMaxLength_1"] = asm["_emscripten_bind_b2RopeJoint_SetMaxLength_1"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_viifii = Module["dynCall_viifii"] = asm["dynCall_viifii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_fif = Module["dynCall_fif"] = asm["dynCall_fif"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_viifi = Module["dynCall_viifi"] = asm["dynCall_viifi"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_viif = Module["dynCall_viif"] = asm["dynCall_viif"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_iiiiii = Module["dynCall_iiiiii"] = asm["dynCall_iiiiii"];
var dynCall_fiiiif = Module["dynCall_fiiiif"] = asm["dynCall_fiiiif"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
;

Runtime.stackAlloc = asm['stackAlloc'];
Runtime.stackSave = asm['stackSave'];
Runtime.stackRestore = asm['stackRestore'];
Runtime.establishStackSpace = asm['establishStackSpace'];

Runtime.setTempRet0 = asm['setTempRet0'];
Runtime.getTempRet0 = asm['getTempRet0'];



// === Auto-generated postamble setup entry stuff ===



if (memoryInitializer) {
  if (typeof Module['locateFile'] === 'function') {
    memoryInitializer = Module['locateFile'](memoryInitializer);
  } else if (Module['memoryInitializerPrefixURL']) {
    memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, Runtime.GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      HEAPU8.set(data, Runtime.GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        if (request.status !== 200 && request.status !== 0) {
          // If you see this warning, the issue may be that you are using locateFile or memoryInitializerPrefixURL, and defining them in JS. That
          // means that the HTML file doesn't know about them, and when it tries to create the mem init request early, does it to the wrong place.
          // Look in your browser's devtools network console to see what's going on.
          console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
          doBrowserLoad();
          return;
        }
        applyMemoryInitializer(request.response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}


function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
      throw e;
    }
  } finally {
    calledMain = true;
  }
}




function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    return;
  }


  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();


    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    return;
  }

  if (Module['noExitRuntime']) {
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  } else if (ENVIRONMENT_IS_SHELL && typeof quit === 'function') {
    quit(status);
  }
  // if we reach here, we must throw an exception to halt the current execution
  throw new ExitStatus(status);
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '\nIf this abort() is unexpected, build with -s ASSERTIONS=1 which can give more information.';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}

Module["noExitRuntime"] = true;

run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}




// Bindings utilities

function WrapperObject() {
}
WrapperObject.prototype = Object.create(WrapperObject.prototype);
WrapperObject.prototype.constructor = WrapperObject;
WrapperObject.prototype.__class__ = WrapperObject;
WrapperObject.__cache__ = {};
Module['WrapperObject'] = WrapperObject;

function getCache(__class__) {
  return (__class__ || WrapperObject).__cache__;
}
Module['getCache'] = getCache;

function wrapPointer(ptr, __class__) {
  var cache = getCache(__class__);
  var ret = cache[ptr];
  if (ret) return ret;
  ret = Object.create((__class__ || WrapperObject).prototype);
  ret.ptr = ptr;
  return cache[ptr] = ret;
}
Module['wrapPointer'] = wrapPointer;

function castObject(obj, __class__) {
  return wrapPointer(obj.ptr, __class__);
}
Module['castObject'] = castObject;

Module['NULL'] = wrapPointer(0);

function destroy(obj) {
  if (!obj['__destroy__']) throw 'Error: Cannot destroy object. (Did you create it yourself?)';
  obj['__destroy__']();
  // Remove from cache, so the object can be GC'd and refs added onto it released
  delete getCache(obj.__class__)[obj.ptr];
}
Module['destroy'] = destroy;

function compare(obj1, obj2) {
  return obj1.ptr === obj2.ptr;
}
Module['compare'] = compare;

function getPointer(obj) {
  return obj.ptr;
}
Module['getPointer'] = getPointer;

function getClass(obj) {
  return obj.__class__;
}
Module['getClass'] = getClass;

// Converts big (string or array) values into a C-style storage, in temporary space

var ensureCache = {
  buffer: 0,  // the main buffer of temporary storage
  size: 0,   // the size of buffer
  pos: 0,    // the next free offset in buffer
  temps: [], // extra allocations
  needed: 0, // the total size we need next time

  prepare: function() {
    if (this.needed) {
      // clear the temps
      for (var i = 0; i < this.temps.length; i++) {
        Module['_free'](this.temps[i]);
      }
      this.temps.length = 0;
      // prepare to allocate a bigger buffer
      Module['_free'](this.buffer);
      this.buffer = 0;
      this.size += this.needed;
      // clean up
      this.needed = 0;
    }
    if (!this.buffer) { // happens first time, or when we need to grow
      this.size += 128; // heuristic, avoid many small grow events
      this.buffer = Module['_malloc'](this.size);
      assert(this.buffer);
    }
    this.pos = 0;
  },
  alloc: function(array, view) {
    assert(this.buffer);
    var bytes = view.BYTES_PER_ELEMENT;
    var len = array.length * bytes;
    len = (len + 7) & -8; // keep things aligned to 8 byte boundaries
    var ret;
    if (this.pos + len >= this.size) {
      // we failed to allocate in the buffer, this time around :(
      assert(len > 0); // null terminator, at least
      this.needed += len;
      ret = Module['_malloc'](len);
      this.temps.push(ret);
    } else {
      // we can allocate in the buffer
      ret = this.buffer + this.pos;
      this.pos += len;
    }
    var retShifted = ret;
    switch (bytes) {
      case 2: retShifted >>= 1; break;
      case 4: retShifted >>= 2; break;
      case 8: retShifted >>= 3; break;
    }
    for (var i = 0; i < array.length; i++) {
      view[retShifted + i] = array[i];
    }
    return ret;
  },
};

function ensureString(value) {
  if (typeof value === 'string') return ensureCache.alloc(intArrayFromString(value), HEAP8);
  return value;
}
function ensureInt8(value) {
  if (typeof value === 'object') return ensureCache.alloc(value, HEAP8);
  return value;
}
function ensureInt16(value) {
  if (typeof value === 'object') return ensureCache.alloc(value, HEAP16);
  return value;
}
function ensureInt32(value) {
  if (typeof value === 'object') return ensureCache.alloc(value, HEAP32);
  return value;
}
function ensureFloat32(value) {
  if (typeof value === 'object') return ensureCache.alloc(value, HEAPF32);
  return value;
}
function ensureFloat64(value) {
  if (typeof value === 'object') return ensureCache.alloc(value, HEAPF64);
  return value;
}


// b2DestructionListenerWrapper
function b2DestructionListenerWrapper() { throw "cannot construct a b2DestructionListenerWrapper, no constructor in IDL" }
b2DestructionListenerWrapper.prototype = Object.create(WrapperObject.prototype);
b2DestructionListenerWrapper.prototype.constructor = b2DestructionListenerWrapper;
b2DestructionListenerWrapper.prototype.__class__ = b2DestructionListenerWrapper;
b2DestructionListenerWrapper.__cache__ = {};
Module['b2DestructionListenerWrapper'] = b2DestructionListenerWrapper;

  b2DestructionListenerWrapper.prototype['__destroy__'] = b2DestructionListenerWrapper.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2DestructionListenerWrapper___destroy___0(self);
};
// b2Draw
function b2Draw() { throw "cannot construct a b2Draw, no constructor in IDL" }
b2Draw.prototype = Object.create(WrapperObject.prototype);
b2Draw.prototype.constructor = b2Draw;
b2Draw.prototype.__class__ = b2Draw;
b2Draw.__cache__ = {};
Module['b2Draw'] = b2Draw;

b2Draw.prototype['SetFlags'] = b2Draw.prototype.SetFlags = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Draw_SetFlags_1(self, arg0);
};;

b2Draw.prototype['GetFlags'] = b2Draw.prototype.GetFlags = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Draw_GetFlags_0(self);
};;

b2Draw.prototype['AppendFlags'] = b2Draw.prototype.AppendFlags = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Draw_AppendFlags_1(self, arg0);
};;

b2Draw.prototype['ClearFlags'] = b2Draw.prototype.ClearFlags = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Draw_ClearFlags_1(self, arg0);
};;

  b2Draw.prototype['__destroy__'] = b2Draw.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Draw___destroy___0(self);
};
// b2Joint
function b2Joint() { throw "cannot construct a b2Joint, no constructor in IDL" }
b2Joint.prototype = Object.create(WrapperObject.prototype);
b2Joint.prototype.constructor = b2Joint;
b2Joint.prototype.__class__ = b2Joint;
b2Joint.__cache__ = {};
Module['b2Joint'] = b2Joint;

b2Joint.prototype['GetType'] = b2Joint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Joint_GetType_0(self);
};;

b2Joint.prototype['GetBodyA'] = b2Joint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetBodyA_0(self), b2Body);
};;

b2Joint.prototype['GetBodyB'] = b2Joint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetBodyB_0(self), b2Body);
};;

b2Joint.prototype['GetAnchorA'] = b2Joint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetAnchorA_0(self), b2Vec2);
};;

b2Joint.prototype['GetAnchorB'] = b2Joint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetAnchorB_0(self), b2Vec2);
};;

b2Joint.prototype['GetReactionForce'] = b2Joint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2Joint.prototype['GetReactionTorque'] = b2Joint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2Joint_GetReactionTorque_1(self, arg0);
};;

b2Joint.prototype['GetNext'] = b2Joint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetNext_0(self), b2Joint);
};;

b2Joint.prototype['GetUserData'] = b2Joint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Joint_GetUserData_0(self);
};;

b2Joint.prototype['SetUserData'] = b2Joint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Joint_SetUserData_1(self, arg0);
};;

b2Joint.prototype['IsActive'] = b2Joint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Joint_IsActive_0(self));
};;

b2Joint.prototype['GetCollideConnected'] = b2Joint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Joint_GetCollideConnected_0(self));
};;

b2Joint.prototype['Dump'] = b2Joint.prototype.Dump = function() {
  var self = this.ptr;
  _emscripten_bind_b2Joint_Dump_0(self);
};;

// b2RayCastCallback
function b2RayCastCallback() { throw "cannot construct a b2RayCastCallback, no constructor in IDL" }
b2RayCastCallback.prototype = Object.create(WrapperObject.prototype);
b2RayCastCallback.prototype.constructor = b2RayCastCallback;
b2RayCastCallback.prototype.__class__ = b2RayCastCallback;
b2RayCastCallback.__cache__ = {};
Module['b2RayCastCallback'] = b2RayCastCallback;

  b2RayCastCallback.prototype['__destroy__'] = b2RayCastCallback.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RayCastCallback___destroy___0(self);
};
// b2ContactListener
function b2ContactListener() { throw "cannot construct a b2ContactListener, no constructor in IDL" }
b2ContactListener.prototype = Object.create(WrapperObject.prototype);
b2ContactListener.prototype.constructor = b2ContactListener;
b2ContactListener.prototype.__class__ = b2ContactListener;
b2ContactListener.__cache__ = {};
Module['b2ContactListener'] = b2ContactListener;

  b2ContactListener.prototype['__destroy__'] = b2ContactListener.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactListener___destroy___0(self);
};
// b2QueryCallback
function b2QueryCallback() { throw "cannot construct a b2QueryCallback, no constructor in IDL" }
b2QueryCallback.prototype = Object.create(WrapperObject.prototype);
b2QueryCallback.prototype.constructor = b2QueryCallback;
b2QueryCallback.prototype.__class__ = b2QueryCallback;
b2QueryCallback.__cache__ = {};
Module['b2QueryCallback'] = b2QueryCallback;

  b2QueryCallback.prototype['__destroy__'] = b2QueryCallback.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2QueryCallback___destroy___0(self);
};
// b2JointDef
function b2JointDef() {
  this.ptr = _emscripten_bind_b2JointDef_b2JointDef_0();
  getCache(b2JointDef)[this.ptr] = this;
};;
b2JointDef.prototype = Object.create(WrapperObject.prototype);
b2JointDef.prototype.constructor = b2JointDef;
b2JointDef.prototype.__class__ = b2JointDef;
b2JointDef.__cache__ = {};
Module['b2JointDef'] = b2JointDef;

  b2JointDef.prototype['get_type'] = b2JointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2JointDef_get_type_0(self);
};
    b2JointDef.prototype['set_type'] = b2JointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointDef_set_type_1(self, arg0);
};
  b2JointDef.prototype['get_userData'] = b2JointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2JointDef_get_userData_0(self);
};
    b2JointDef.prototype['set_userData'] = b2JointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointDef_set_userData_1(self, arg0);
};
  b2JointDef.prototype['get_bodyA'] = b2JointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointDef_get_bodyA_0(self), b2Body);
};
    b2JointDef.prototype['set_bodyA'] = b2JointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointDef_set_bodyA_1(self, arg0);
};
  b2JointDef.prototype['get_bodyB'] = b2JointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointDef_get_bodyB_0(self), b2Body);
};
    b2JointDef.prototype['set_bodyB'] = b2JointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointDef_set_bodyB_1(self, arg0);
};
  b2JointDef.prototype['get_collideConnected'] = b2JointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2JointDef_get_collideConnected_0(self));
};
    b2JointDef.prototype['set_collideConnected'] = b2JointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointDef_set_collideConnected_1(self, arg0);
};
  b2JointDef.prototype['__destroy__'] = b2JointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2JointDef___destroy___0(self);
};
// b2Shape
function b2Shape() { throw "cannot construct a b2Shape, no constructor in IDL" }
b2Shape.prototype = Object.create(WrapperObject.prototype);
b2Shape.prototype.constructor = b2Shape;
b2Shape.prototype.__class__ = b2Shape;
b2Shape.__cache__ = {};
Module['b2Shape'] = b2Shape;

b2Shape.prototype['GetType'] = b2Shape.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Shape_GetType_0(self);
};;

b2Shape.prototype['GetChildCount'] = b2Shape.prototype.GetChildCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Shape_GetChildCount_0(self);
};;

b2Shape.prototype['TestPoint'] = b2Shape.prototype.TestPoint = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2Shape_TestPoint_2(self, arg0, arg1));
};;

b2Shape.prototype['RayCast'] = b2Shape.prototype.RayCast = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return !!(_emscripten_bind_b2Shape_RayCast_4(self, arg0, arg1, arg2, arg3));
};;

b2Shape.prototype['ComputeAABB'] = b2Shape.prototype.ComputeAABB = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2Shape_ComputeAABB_3(self, arg0, arg1, arg2);
};;

b2Shape.prototype['ComputeMass'] = b2Shape.prototype.ComputeMass = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Shape_ComputeMass_2(self, arg0, arg1);
};;

  b2Shape.prototype['get_m_type'] = b2Shape.prototype.get_m_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Shape_get_m_type_0(self);
};
    b2Shape.prototype['set_m_type'] = b2Shape.prototype.set_m_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Shape_set_m_type_1(self, arg0);
};
  b2Shape.prototype['get_m_radius'] = b2Shape.prototype.get_m_radius = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Shape_get_m_radius_0(self);
};
    b2Shape.prototype['set_m_radius'] = b2Shape.prototype.set_m_radius = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Shape_set_m_radius_1(self, arg0);
};
  b2Shape.prototype['__destroy__'] = b2Shape.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Shape___destroy___0(self);
};
// b2ContactFilter
function b2ContactFilter() { throw "cannot construct a b2ContactFilter, no constructor in IDL" }
b2ContactFilter.prototype = Object.create(WrapperObject.prototype);
b2ContactFilter.prototype.constructor = b2ContactFilter;
b2ContactFilter.prototype.__class__ = b2ContactFilter;
b2ContactFilter.__cache__ = {};
Module['b2ContactFilter'] = b2ContactFilter;

  b2ContactFilter.prototype['__destroy__'] = b2ContactFilter.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactFilter___destroy___0(self);
};
// JSDestructionListener
function JSDestructionListener() {
  this.ptr = _emscripten_bind_JSDestructionListener_JSDestructionListener_0();
  getCache(JSDestructionListener)[this.ptr] = this;
};;
JSDestructionListener.prototype = Object.create(b2DestructionListenerWrapper.prototype);
JSDestructionListener.prototype.constructor = JSDestructionListener;
JSDestructionListener.prototype.__class__ = JSDestructionListener;
JSDestructionListener.__cache__ = {};
Module['JSDestructionListener'] = JSDestructionListener;

JSDestructionListener.prototype['SayGoodbyeJoint'] = JSDestructionListener.prototype.SayGoodbyeJoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_JSDestructionListener_SayGoodbyeJoint_1(self, arg0);
};;

JSDestructionListener.prototype['SayGoodbyeFixture'] = JSDestructionListener.prototype.SayGoodbyeFixture = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_JSDestructionListener_SayGoodbyeFixture_1(self, arg0);
};;

  JSDestructionListener.prototype['__destroy__'] = JSDestructionListener.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSDestructionListener___destroy___0(self);
};
// b2ContactImpulse
function b2ContactImpulse() { throw "cannot construct a b2ContactImpulse, no constructor in IDL" }
b2ContactImpulse.prototype = Object.create(WrapperObject.prototype);
b2ContactImpulse.prototype.constructor = b2ContactImpulse;
b2ContactImpulse.prototype.__class__ = b2ContactImpulse;
b2ContactImpulse.__cache__ = {};
Module['b2ContactImpulse'] = b2ContactImpulse;

  b2ContactImpulse.prototype['get_count'] = b2ContactImpulse.prototype.get_count = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactImpulse_get_count_0(self);
};
    b2ContactImpulse.prototype['set_count'] = b2ContactImpulse.prototype.set_count = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactImpulse_set_count_1(self, arg0);
};
  b2ContactImpulse.prototype['__destroy__'] = b2ContactImpulse.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactImpulse___destroy___0(self);
};
// b2DistanceJoint
function b2DistanceJoint() { throw "cannot construct a b2DistanceJoint, no constructor in IDL" }
b2DistanceJoint.prototype = Object.create(b2Joint.prototype);
b2DistanceJoint.prototype.constructor = b2DistanceJoint;
b2DistanceJoint.prototype.__class__ = b2DistanceJoint;
b2DistanceJoint.__cache__ = {};
Module['b2DistanceJoint'] = b2DistanceJoint;

b2DistanceJoint.prototype['GetLocalAnchorA'] = b2DistanceJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2DistanceJoint.prototype['GetLocalAnchorB'] = b2DistanceJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2DistanceJoint.prototype['SetLength'] = b2DistanceJoint.prototype.SetLength = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJoint_SetLength_1(self, arg0);
};;

b2DistanceJoint.prototype['GetLength'] = b2DistanceJoint.prototype.GetLength = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJoint_GetLength_0(self);
};;

b2DistanceJoint.prototype['SetFrequency'] = b2DistanceJoint.prototype.SetFrequency = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJoint_SetFrequency_1(self, arg0);
};;

b2DistanceJoint.prototype['GetFrequency'] = b2DistanceJoint.prototype.GetFrequency = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJoint_GetFrequency_0(self);
};;

b2DistanceJoint.prototype['SetDampingRatio'] = b2DistanceJoint.prototype.SetDampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJoint_SetDampingRatio_1(self, arg0);
};;

b2DistanceJoint.prototype['GetDampingRatio'] = b2DistanceJoint.prototype.GetDampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJoint_GetDampingRatio_0(self);
};;

b2DistanceJoint.prototype['GetType'] = b2DistanceJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJoint_GetType_0(self);
};;

b2DistanceJoint.prototype['GetBodyA'] = b2DistanceJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetBodyA_0(self), b2Body);
};;

b2DistanceJoint.prototype['GetBodyB'] = b2DistanceJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetBodyB_0(self), b2Body);
};;

b2DistanceJoint.prototype['GetAnchorA'] = b2DistanceJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetAnchorA_0(self), b2Vec2);
};;

b2DistanceJoint.prototype['GetAnchorB'] = b2DistanceJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetAnchorB_0(self), b2Vec2);
};;

b2DistanceJoint.prototype['GetReactionForce'] = b2DistanceJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2DistanceJoint.prototype['GetReactionTorque'] = b2DistanceJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2DistanceJoint_GetReactionTorque_1(self, arg0);
};;

b2DistanceJoint.prototype['GetNext'] = b2DistanceJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetNext_0(self), b2Joint);
};;

b2DistanceJoint.prototype['GetUserData'] = b2DistanceJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJoint_GetUserData_0(self);
};;

b2DistanceJoint.prototype['SetUserData'] = b2DistanceJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJoint_SetUserData_1(self, arg0);
};;

b2DistanceJoint.prototype['IsActive'] = b2DistanceJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2DistanceJoint_IsActive_0(self));
};;

b2DistanceJoint.prototype['GetCollideConnected'] = b2DistanceJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2DistanceJoint_GetCollideConnected_0(self));
};;

  b2DistanceJoint.prototype['__destroy__'] = b2DistanceJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2DistanceJoint___destroy___0(self);
};
// b2Mat33
function b2Mat33(arg0, arg1, arg2) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Mat33_b2Mat33_0(); getCache(b2Mat33)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Mat33_b2Mat33_1(arg0); getCache(b2Mat33)[this.ptr] = this;return }
  if (arg2 === undefined) { this.ptr = _emscripten_bind_b2Mat33_b2Mat33_2(arg0, arg1); getCache(b2Mat33)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Mat33_b2Mat33_3(arg0, arg1, arg2);
  getCache(b2Mat33)[this.ptr] = this;
};;
b2Mat33.prototype = Object.create(WrapperObject.prototype);
b2Mat33.prototype.constructor = b2Mat33;
b2Mat33.prototype.__class__ = b2Mat33;
b2Mat33.__cache__ = {};
Module['b2Mat33'] = b2Mat33;

b2Mat33.prototype['SetZero'] = b2Mat33.prototype.SetZero = function() {
  var self = this.ptr;
  _emscripten_bind_b2Mat33_SetZero_0(self);
};;

b2Mat33.prototype['Solve33'] = b2Mat33.prototype.Solve33 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Mat33_Solve33_1(self, arg0), b2Vec3);
};;

b2Mat33.prototype['Solve22'] = b2Mat33.prototype.Solve22 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Mat33_Solve22_1(self, arg0), b2Vec2);
};;

b2Mat33.prototype['GetInverse22'] = b2Mat33.prototype.GetInverse22 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat33_GetInverse22_1(self, arg0);
};;

b2Mat33.prototype['GetSymInverse33'] = b2Mat33.prototype.GetSymInverse33 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat33_GetSymInverse33_1(self, arg0);
};;

  b2Mat33.prototype['get_ex'] = b2Mat33.prototype.get_ex = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat33_get_ex_0(self), b2Vec3);
};
    b2Mat33.prototype['set_ex'] = b2Mat33.prototype.set_ex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat33_set_ex_1(self, arg0);
};
  b2Mat33.prototype['get_ey'] = b2Mat33.prototype.get_ey = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat33_get_ey_0(self), b2Vec3);
};
    b2Mat33.prototype['set_ey'] = b2Mat33.prototype.set_ey = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat33_set_ey_1(self, arg0);
};
  b2Mat33.prototype['get_ez'] = b2Mat33.prototype.get_ez = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat33_get_ez_0(self), b2Vec3);
};
    b2Mat33.prototype['set_ez'] = b2Mat33.prototype.set_ez = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat33_set_ez_1(self, arg0);
};
  b2Mat33.prototype['__destroy__'] = b2Mat33.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Mat33___destroy___0(self);
};
// b2Fixture
function b2Fixture() { throw "cannot construct a b2Fixture, no constructor in IDL" }
b2Fixture.prototype = Object.create(WrapperObject.prototype);
b2Fixture.prototype.constructor = b2Fixture;
b2Fixture.prototype.__class__ = b2Fixture;
b2Fixture.__cache__ = {};
Module['b2Fixture'] = b2Fixture;

b2Fixture.prototype['GetType'] = b2Fixture.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Fixture_GetType_0(self);
};;

b2Fixture.prototype['GetShape'] = b2Fixture.prototype.GetShape = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Fixture_GetShape_0(self), b2Shape);
};;

b2Fixture.prototype['SetSensor'] = b2Fixture.prototype.SetSensor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetSensor_1(self, arg0);
};;

b2Fixture.prototype['IsSensor'] = b2Fixture.prototype.IsSensor = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Fixture_IsSensor_0(self));
};;

b2Fixture.prototype['SetFilterData'] = b2Fixture.prototype.SetFilterData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetFilterData_1(self, arg0);
};;

b2Fixture.prototype['GetFilterData'] = b2Fixture.prototype.GetFilterData = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Fixture_GetFilterData_0(self), b2Filter);
};;

b2Fixture.prototype['Refilter'] = b2Fixture.prototype.Refilter = function() {
  var self = this.ptr;
  _emscripten_bind_b2Fixture_Refilter_0(self);
};;

b2Fixture.prototype['GetBody'] = b2Fixture.prototype.GetBody = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Fixture_GetBody_0(self), b2Body);
};;

b2Fixture.prototype['GetNext'] = b2Fixture.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Fixture_GetNext_0(self), b2Fixture);
};;

b2Fixture.prototype['GetUserData'] = b2Fixture.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Fixture_GetUserData_0(self);
};;

b2Fixture.prototype['SetUserData'] = b2Fixture.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetUserData_1(self, arg0);
};;

b2Fixture.prototype['TestPoint'] = b2Fixture.prototype.TestPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return !!(_emscripten_bind_b2Fixture_TestPoint_1(self, arg0));
};;

b2Fixture.prototype['RayCast'] = b2Fixture.prototype.RayCast = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  return !!(_emscripten_bind_b2Fixture_RayCast_3(self, arg0, arg1, arg2));
};;

b2Fixture.prototype['GetMassData'] = b2Fixture.prototype.GetMassData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_GetMassData_1(self, arg0);
};;

b2Fixture.prototype['SetDensity'] = b2Fixture.prototype.SetDensity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetDensity_1(self, arg0);
};;

b2Fixture.prototype['GetDensity'] = b2Fixture.prototype.GetDensity = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Fixture_GetDensity_0(self);
};;

b2Fixture.prototype['GetFriction'] = b2Fixture.prototype.GetFriction = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Fixture_GetFriction_0(self);
};;

b2Fixture.prototype['SetFriction'] = b2Fixture.prototype.SetFriction = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetFriction_1(self, arg0);
};;

b2Fixture.prototype['GetRestitution'] = b2Fixture.prototype.GetRestitution = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Fixture_GetRestitution_0(self);
};;

b2Fixture.prototype['SetRestitution'] = b2Fixture.prototype.SetRestitution = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetRestitution_1(self, arg0);
};;

b2Fixture.prototype['GetAABB'] = b2Fixture.prototype.GetAABB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Fixture_GetAABB_1(self, arg0), b2AABB);
};;

b2Fixture.prototype['Dump'] = b2Fixture.prototype.Dump = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_Dump_1(self, arg0);
};;

  b2Fixture.prototype['__destroy__'] = b2Fixture.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Fixture___destroy___0(self);
};
// b2Filter
function b2Filter() {
  this.ptr = _emscripten_bind_b2Filter_b2Filter_0();
  getCache(b2Filter)[this.ptr] = this;
};;
b2Filter.prototype = Object.create(WrapperObject.prototype);
b2Filter.prototype.constructor = b2Filter;
b2Filter.prototype.__class__ = b2Filter;
b2Filter.__cache__ = {};
Module['b2Filter'] = b2Filter;

  b2Filter.prototype['get_categoryBits'] = b2Filter.prototype.get_categoryBits = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Filter_get_categoryBits_0(self);
};
    b2Filter.prototype['set_categoryBits'] = b2Filter.prototype.set_categoryBits = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Filter_set_categoryBits_1(self, arg0);
};
  b2Filter.prototype['get_maskBits'] = b2Filter.prototype.get_maskBits = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Filter_get_maskBits_0(self);
};
    b2Filter.prototype['set_maskBits'] = b2Filter.prototype.set_maskBits = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Filter_set_maskBits_1(self, arg0);
};
  b2Filter.prototype['get_groupIndex'] = b2Filter.prototype.get_groupIndex = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Filter_get_groupIndex_0(self);
};
    b2Filter.prototype['set_groupIndex'] = b2Filter.prototype.set_groupIndex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Filter_set_groupIndex_1(self, arg0);
};
  b2Filter.prototype['__destroy__'] = b2Filter.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Filter___destroy___0(self);
};
// JSQueryCallback
function JSQueryCallback() {
  this.ptr = _emscripten_bind_JSQueryCallback_JSQueryCallback_0();
  getCache(JSQueryCallback)[this.ptr] = this;
};;
JSQueryCallback.prototype = Object.create(b2QueryCallback.prototype);
JSQueryCallback.prototype.constructor = JSQueryCallback;
JSQueryCallback.prototype.__class__ = JSQueryCallback;
JSQueryCallback.__cache__ = {};
Module['JSQueryCallback'] = JSQueryCallback;

JSQueryCallback.prototype['ReportFixture'] = JSQueryCallback.prototype.ReportFixture = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return !!(_emscripten_bind_JSQueryCallback_ReportFixture_1(self, arg0));
};;

  JSQueryCallback.prototype['__destroy__'] = JSQueryCallback.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSQueryCallback___destroy___0(self);
};
// b2MouseJoint
function b2MouseJoint() { throw "cannot construct a b2MouseJoint, no constructor in IDL" }
b2MouseJoint.prototype = Object.create(b2Joint.prototype);
b2MouseJoint.prototype.constructor = b2MouseJoint;
b2MouseJoint.prototype.__class__ = b2MouseJoint;
b2MouseJoint.__cache__ = {};
Module['b2MouseJoint'] = b2MouseJoint;

b2MouseJoint.prototype['SetTarget'] = b2MouseJoint.prototype.SetTarget = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJoint_SetTarget_1(self, arg0);
};;

b2MouseJoint.prototype['GetTarget'] = b2MouseJoint.prototype.GetTarget = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetTarget_0(self), b2Vec2);
};;

b2MouseJoint.prototype['SetMaxForce'] = b2MouseJoint.prototype.SetMaxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJoint_SetMaxForce_1(self, arg0);
};;

b2MouseJoint.prototype['GetMaxForce'] = b2MouseJoint.prototype.GetMaxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJoint_GetMaxForce_0(self);
};;

b2MouseJoint.prototype['SetFrequency'] = b2MouseJoint.prototype.SetFrequency = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJoint_SetFrequency_1(self, arg0);
};;

b2MouseJoint.prototype['GetFrequency'] = b2MouseJoint.prototype.GetFrequency = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJoint_GetFrequency_0(self);
};;

b2MouseJoint.prototype['SetDampingRatio'] = b2MouseJoint.prototype.SetDampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJoint_SetDampingRatio_1(self, arg0);
};;

b2MouseJoint.prototype['GetDampingRatio'] = b2MouseJoint.prototype.GetDampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJoint_GetDampingRatio_0(self);
};;

b2MouseJoint.prototype['GetType'] = b2MouseJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJoint_GetType_0(self);
};;

b2MouseJoint.prototype['GetBodyA'] = b2MouseJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetBodyA_0(self), b2Body);
};;

b2MouseJoint.prototype['GetBodyB'] = b2MouseJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetBodyB_0(self), b2Body);
};;

b2MouseJoint.prototype['GetAnchorA'] = b2MouseJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetAnchorA_0(self), b2Vec2);
};;

b2MouseJoint.prototype['GetAnchorB'] = b2MouseJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetAnchorB_0(self), b2Vec2);
};;

b2MouseJoint.prototype['GetReactionForce'] = b2MouseJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2MouseJoint.prototype['GetReactionTorque'] = b2MouseJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2MouseJoint_GetReactionTorque_1(self, arg0);
};;

b2MouseJoint.prototype['GetNext'] = b2MouseJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetNext_0(self), b2Joint);
};;

b2MouseJoint.prototype['GetUserData'] = b2MouseJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJoint_GetUserData_0(self);
};;

b2MouseJoint.prototype['SetUserData'] = b2MouseJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJoint_SetUserData_1(self, arg0);
};;

b2MouseJoint.prototype['IsActive'] = b2MouseJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MouseJoint_IsActive_0(self));
};;

b2MouseJoint.prototype['GetCollideConnected'] = b2MouseJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MouseJoint_GetCollideConnected_0(self));
};;

  b2MouseJoint.prototype['__destroy__'] = b2MouseJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2MouseJoint___destroy___0(self);
};
// b2Rot
function b2Rot(arg0) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Rot_b2Rot_0(); getCache(b2Rot)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Rot_b2Rot_1(arg0);
  getCache(b2Rot)[this.ptr] = this;
};;
b2Rot.prototype = Object.create(WrapperObject.prototype);
b2Rot.prototype.constructor = b2Rot;
b2Rot.prototype.__class__ = b2Rot;
b2Rot.__cache__ = {};
Module['b2Rot'] = b2Rot;

b2Rot.prototype['Set'] = b2Rot.prototype.Set = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Rot_Set_1(self, arg0);
};;

b2Rot.prototype['SetIdentity'] = b2Rot.prototype.SetIdentity = function() {
  var self = this.ptr;
  _emscripten_bind_b2Rot_SetIdentity_0(self);
};;

b2Rot.prototype['GetAngle'] = b2Rot.prototype.GetAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Rot_GetAngle_0(self);
};;

b2Rot.prototype['GetXAxis'] = b2Rot.prototype.GetXAxis = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Rot_GetXAxis_0(self), b2Vec2);
};;

b2Rot.prototype['GetYAxis'] = b2Rot.prototype.GetYAxis = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Rot_GetYAxis_0(self), b2Vec2);
};;

  b2Rot.prototype['get_s'] = b2Rot.prototype.get_s = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Rot_get_s_0(self);
};
    b2Rot.prototype['set_s'] = b2Rot.prototype.set_s = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Rot_set_s_1(self, arg0);
};
  b2Rot.prototype['get_c'] = b2Rot.prototype.get_c = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Rot_get_c_0(self);
};
    b2Rot.prototype['set_c'] = b2Rot.prototype.set_c = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Rot_set_c_1(self, arg0);
};
  b2Rot.prototype['__destroy__'] = b2Rot.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Rot___destroy___0(self);
};
// b2MotorJoint
function b2MotorJoint() { throw "cannot construct a b2MotorJoint, no constructor in IDL" }
b2MotorJoint.prototype = Object.create(b2Joint.prototype);
b2MotorJoint.prototype.constructor = b2MotorJoint;
b2MotorJoint.prototype.__class__ = b2MotorJoint;
b2MotorJoint.__cache__ = {};
Module['b2MotorJoint'] = b2MotorJoint;

b2MotorJoint.prototype['SetLinearOffset'] = b2MotorJoint.prototype.SetLinearOffset = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetLinearOffset_1(self, arg0);
};;

b2MotorJoint.prototype['GetLinearOffset'] = b2MotorJoint.prototype.GetLinearOffset = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetLinearOffset_0(self), b2Vec2);
};;

b2MotorJoint.prototype['SetAngularOffset'] = b2MotorJoint.prototype.SetAngularOffset = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetAngularOffset_1(self, arg0);
};;

b2MotorJoint.prototype['GetAngularOffset'] = b2MotorJoint.prototype.GetAngularOffset = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetAngularOffset_0(self);
};;

b2MotorJoint.prototype['SetMaxForce'] = b2MotorJoint.prototype.SetMaxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetMaxForce_1(self, arg0);
};;

b2MotorJoint.prototype['GetMaxForce'] = b2MotorJoint.prototype.GetMaxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetMaxForce_0(self);
};;

b2MotorJoint.prototype['SetMaxTorque'] = b2MotorJoint.prototype.SetMaxTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetMaxTorque_1(self, arg0);
};;

b2MotorJoint.prototype['GetMaxTorque'] = b2MotorJoint.prototype.GetMaxTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetMaxTorque_0(self);
};;

b2MotorJoint.prototype['SetCorrectionFactor'] = b2MotorJoint.prototype.SetCorrectionFactor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetCorrectionFactor_1(self, arg0);
};;

b2MotorJoint.prototype['GetCorrectionFactor'] = b2MotorJoint.prototype.GetCorrectionFactor = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetCorrectionFactor_0(self);
};;

b2MotorJoint.prototype['GetType'] = b2MotorJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetType_0(self);
};;

b2MotorJoint.prototype['GetBodyA'] = b2MotorJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetBodyA_0(self), b2Body);
};;

b2MotorJoint.prototype['GetBodyB'] = b2MotorJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetBodyB_0(self), b2Body);
};;

b2MotorJoint.prototype['GetAnchorA'] = b2MotorJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetAnchorA_0(self), b2Vec2);
};;

b2MotorJoint.prototype['GetAnchorB'] = b2MotorJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetAnchorB_0(self), b2Vec2);
};;

b2MotorJoint.prototype['GetReactionForce'] = b2MotorJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2MotorJoint.prototype['GetReactionTorque'] = b2MotorJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2MotorJoint_GetReactionTorque_1(self, arg0);
};;

b2MotorJoint.prototype['GetNext'] = b2MotorJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetNext_0(self), b2Joint);
};;

b2MotorJoint.prototype['GetUserData'] = b2MotorJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetUserData_0(self);
};;

b2MotorJoint.prototype['SetUserData'] = b2MotorJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetUserData_1(self, arg0);
};;

b2MotorJoint.prototype['IsActive'] = b2MotorJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MotorJoint_IsActive_0(self));
};;

b2MotorJoint.prototype['GetCollideConnected'] = b2MotorJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MotorJoint_GetCollideConnected_0(self));
};;

  b2MotorJoint.prototype['__destroy__'] = b2MotorJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2MotorJoint___destroy___0(self);
};
// b2Profile
function b2Profile() { throw "cannot construct a b2Profile, no constructor in IDL" }
b2Profile.prototype = Object.create(WrapperObject.prototype);
b2Profile.prototype.constructor = b2Profile;
b2Profile.prototype.__class__ = b2Profile;
b2Profile.__cache__ = {};
Module['b2Profile'] = b2Profile;

  b2Profile.prototype['get_step'] = b2Profile.prototype.get_step = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_step_0(self);
};
    b2Profile.prototype['set_step'] = b2Profile.prototype.set_step = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_step_1(self, arg0);
};
  b2Profile.prototype['get_collide'] = b2Profile.prototype.get_collide = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_collide_0(self);
};
    b2Profile.prototype['set_collide'] = b2Profile.prototype.set_collide = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_collide_1(self, arg0);
};
  b2Profile.prototype['get_solve'] = b2Profile.prototype.get_solve = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_solve_0(self);
};
    b2Profile.prototype['set_solve'] = b2Profile.prototype.set_solve = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_solve_1(self, arg0);
};
  b2Profile.prototype['get_solveInit'] = b2Profile.prototype.get_solveInit = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_solveInit_0(self);
};
    b2Profile.prototype['set_solveInit'] = b2Profile.prototype.set_solveInit = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_solveInit_1(self, arg0);
};
  b2Profile.prototype['get_solveVelocity'] = b2Profile.prototype.get_solveVelocity = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_solveVelocity_0(self);
};
    b2Profile.prototype['set_solveVelocity'] = b2Profile.prototype.set_solveVelocity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_solveVelocity_1(self, arg0);
};
  b2Profile.prototype['get_solvePosition'] = b2Profile.prototype.get_solvePosition = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_solvePosition_0(self);
};
    b2Profile.prototype['set_solvePosition'] = b2Profile.prototype.set_solvePosition = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_solvePosition_1(self, arg0);
};
  b2Profile.prototype['get_broadphase'] = b2Profile.prototype.get_broadphase = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_broadphase_0(self);
};
    b2Profile.prototype['set_broadphase'] = b2Profile.prototype.set_broadphase = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_broadphase_1(self, arg0);
};
  b2Profile.prototype['get_solveTOI'] = b2Profile.prototype.get_solveTOI = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_solveTOI_0(self);
};
    b2Profile.prototype['set_solveTOI'] = b2Profile.prototype.set_solveTOI = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_solveTOI_1(self, arg0);
};
  b2Profile.prototype['__destroy__'] = b2Profile.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Profile___destroy___0(self);
};
// VoidPtr
function VoidPtr() { throw "cannot construct a VoidPtr, no constructor in IDL" }
VoidPtr.prototype = Object.create(WrapperObject.prototype);
VoidPtr.prototype.constructor = VoidPtr;
VoidPtr.prototype.__class__ = VoidPtr;
VoidPtr.__cache__ = {};
Module['VoidPtr'] = VoidPtr;

  VoidPtr.prototype['__destroy__'] = VoidPtr.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_VoidPtr___destroy___0(self);
};
// b2BodyDef
function b2BodyDef() {
  this.ptr = _emscripten_bind_b2BodyDef_b2BodyDef_0();
  getCache(b2BodyDef)[this.ptr] = this;
};;
b2BodyDef.prototype = Object.create(WrapperObject.prototype);
b2BodyDef.prototype.constructor = b2BodyDef;
b2BodyDef.prototype.__class__ = b2BodyDef;
b2BodyDef.__cache__ = {};
Module['b2BodyDef'] = b2BodyDef;

  b2BodyDef.prototype['get_type'] = b2BodyDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_type_0(self);
};
    b2BodyDef.prototype['set_type'] = b2BodyDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_type_1(self, arg0);
};
  b2BodyDef.prototype['get_position'] = b2BodyDef.prototype.get_position = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2BodyDef_get_position_0(self), b2Vec2);
};
    b2BodyDef.prototype['set_position'] = b2BodyDef.prototype.set_position = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_position_1(self, arg0);
};
  b2BodyDef.prototype['get_angle'] = b2BodyDef.prototype.get_angle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_angle_0(self);
};
    b2BodyDef.prototype['set_angle'] = b2BodyDef.prototype.set_angle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_angle_1(self, arg0);
};
  b2BodyDef.prototype['get_linearVelocity'] = b2BodyDef.prototype.get_linearVelocity = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2BodyDef_get_linearVelocity_0(self), b2Vec2);
};
    b2BodyDef.prototype['set_linearVelocity'] = b2BodyDef.prototype.set_linearVelocity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_linearVelocity_1(self, arg0);
};
  b2BodyDef.prototype['get_angularVelocity'] = b2BodyDef.prototype.get_angularVelocity = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_angularVelocity_0(self);
};
    b2BodyDef.prototype['set_angularVelocity'] = b2BodyDef.prototype.set_angularVelocity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_angularVelocity_1(self, arg0);
};
  b2BodyDef.prototype['get_linearDamping'] = b2BodyDef.prototype.get_linearDamping = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_linearDamping_0(self);
};
    b2BodyDef.prototype['set_linearDamping'] = b2BodyDef.prototype.set_linearDamping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_linearDamping_1(self, arg0);
};
  b2BodyDef.prototype['get_angularDamping'] = b2BodyDef.prototype.get_angularDamping = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_angularDamping_0(self);
};
    b2BodyDef.prototype['set_angularDamping'] = b2BodyDef.prototype.set_angularDamping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_angularDamping_1(self, arg0);
};
  b2BodyDef.prototype['get_allowSleep'] = b2BodyDef.prototype.get_allowSleep = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2BodyDef_get_allowSleep_0(self));
};
    b2BodyDef.prototype['set_allowSleep'] = b2BodyDef.prototype.set_allowSleep = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_allowSleep_1(self, arg0);
};
  b2BodyDef.prototype['get_awake'] = b2BodyDef.prototype.get_awake = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2BodyDef_get_awake_0(self));
};
    b2BodyDef.prototype['set_awake'] = b2BodyDef.prototype.set_awake = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_awake_1(self, arg0);
};
  b2BodyDef.prototype['get_fixedRotation'] = b2BodyDef.prototype.get_fixedRotation = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2BodyDef_get_fixedRotation_0(self));
};
    b2BodyDef.prototype['set_fixedRotation'] = b2BodyDef.prototype.set_fixedRotation = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_fixedRotation_1(self, arg0);
};
  b2BodyDef.prototype['get_bullet'] = b2BodyDef.prototype.get_bullet = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2BodyDef_get_bullet_0(self));
};
    b2BodyDef.prototype['set_bullet'] = b2BodyDef.prototype.set_bullet = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_bullet_1(self, arg0);
};
  b2BodyDef.prototype['get_active'] = b2BodyDef.prototype.get_active = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2BodyDef_get_active_0(self));
};
    b2BodyDef.prototype['set_active'] = b2BodyDef.prototype.set_active = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_active_1(self, arg0);
};
  b2BodyDef.prototype['get_userData'] = b2BodyDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_userData_0(self);
};
    b2BodyDef.prototype['set_userData'] = b2BodyDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_userData_1(self, arg0);
};
  b2BodyDef.prototype['get_gravityScale'] = b2BodyDef.prototype.get_gravityScale = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_gravityScale_0(self);
};
    b2BodyDef.prototype['set_gravityScale'] = b2BodyDef.prototype.set_gravityScale = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_gravityScale_1(self, arg0);
};
  b2BodyDef.prototype['__destroy__'] = b2BodyDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2BodyDef___destroy___0(self);
};
// JSRayCastCallback
function JSRayCastCallback() {
  this.ptr = _emscripten_bind_JSRayCastCallback_JSRayCastCallback_0();
  getCache(JSRayCastCallback)[this.ptr] = this;
};;
JSRayCastCallback.prototype = Object.create(b2RayCastCallback.prototype);
JSRayCastCallback.prototype.constructor = JSRayCastCallback;
JSRayCastCallback.prototype.__class__ = JSRayCastCallback;
JSRayCastCallback.__cache__ = {};
Module['JSRayCastCallback'] = JSRayCastCallback;

JSRayCastCallback.prototype['ReportFixture'] = JSRayCastCallback.prototype.ReportFixture = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return _emscripten_bind_JSRayCastCallback_ReportFixture_4(self, arg0, arg1, arg2, arg3);
};;

  JSRayCastCallback.prototype['__destroy__'] = JSRayCastCallback.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSRayCastCallback___destroy___0(self);
};
// b2ContactFeature
function b2ContactFeature() { throw "cannot construct a b2ContactFeature, no constructor in IDL" }
b2ContactFeature.prototype = Object.create(WrapperObject.prototype);
b2ContactFeature.prototype.constructor = b2ContactFeature;
b2ContactFeature.prototype.__class__ = b2ContactFeature;
b2ContactFeature.__cache__ = {};
Module['b2ContactFeature'] = b2ContactFeature;

  b2ContactFeature.prototype['get_indexA'] = b2ContactFeature.prototype.get_indexA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactFeature_get_indexA_0(self);
};
    b2ContactFeature.prototype['set_indexA'] = b2ContactFeature.prototype.set_indexA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactFeature_set_indexA_1(self, arg0);
};
  b2ContactFeature.prototype['get_indexB'] = b2ContactFeature.prototype.get_indexB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactFeature_get_indexB_0(self);
};
    b2ContactFeature.prototype['set_indexB'] = b2ContactFeature.prototype.set_indexB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactFeature_set_indexB_1(self, arg0);
};
  b2ContactFeature.prototype['get_typeA'] = b2ContactFeature.prototype.get_typeA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactFeature_get_typeA_0(self);
};
    b2ContactFeature.prototype['set_typeA'] = b2ContactFeature.prototype.set_typeA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactFeature_set_typeA_1(self, arg0);
};
  b2ContactFeature.prototype['get_typeB'] = b2ContactFeature.prototype.get_typeB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactFeature_get_typeB_0(self);
};
    b2ContactFeature.prototype['set_typeB'] = b2ContactFeature.prototype.set_typeB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactFeature_set_typeB_1(self, arg0);
};
  b2ContactFeature.prototype['__destroy__'] = b2ContactFeature.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactFeature___destroy___0(self);
};
// b2Vec2
function b2Vec2(arg0, arg1) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Vec2_b2Vec2_0(); getCache(b2Vec2)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Vec2_b2Vec2_1(arg0); getCache(b2Vec2)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Vec2_b2Vec2_2(arg0, arg1);
  getCache(b2Vec2)[this.ptr] = this;
};;
b2Vec2.prototype = Object.create(WrapperObject.prototype);
b2Vec2.prototype.constructor = b2Vec2;
b2Vec2.prototype.__class__ = b2Vec2;
b2Vec2.__cache__ = {};
Module['b2Vec2'] = b2Vec2;

b2Vec2.prototype['SetZero'] = b2Vec2.prototype.SetZero = function() {
  var self = this.ptr;
  _emscripten_bind_b2Vec2_SetZero_0(self);
};;

b2Vec2.prototype['Set'] = b2Vec2.prototype.Set = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Vec2_Set_2(self, arg0, arg1);
};;

b2Vec2.prototype['op_add'] = b2Vec2.prototype.op_add = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec2_op_add_1(self, arg0);
};;

b2Vec2.prototype['op_sub'] = b2Vec2.prototype.op_sub = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec2_op_sub_1(self, arg0);
};;

b2Vec2.prototype['op_mul'] = b2Vec2.prototype.op_mul = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec2_op_mul_1(self, arg0);
};;

b2Vec2.prototype['Length'] = b2Vec2.prototype.Length = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec2_Length_0(self);
};;

b2Vec2.prototype['LengthSquared'] = b2Vec2.prototype.LengthSquared = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec2_LengthSquared_0(self);
};;

b2Vec2.prototype['Normalize'] = b2Vec2.prototype.Normalize = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec2_Normalize_0(self);
};;

b2Vec2.prototype['IsValid'] = b2Vec2.prototype.IsValid = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Vec2_IsValid_0(self));
};;

b2Vec2.prototype['Skew'] = b2Vec2.prototype.Skew = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Vec2_Skew_0(self), b2Vec2);
};;

  b2Vec2.prototype['get_x'] = b2Vec2.prototype.get_x = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec2_get_x_0(self);
};
    b2Vec2.prototype['set_x'] = b2Vec2.prototype.set_x = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec2_set_x_1(self, arg0);
};
  b2Vec2.prototype['get_y'] = b2Vec2.prototype.get_y = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec2_get_y_0(self);
};
    b2Vec2.prototype['set_y'] = b2Vec2.prototype.set_y = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec2_set_y_1(self, arg0);
};
  b2Vec2.prototype['__destroy__'] = b2Vec2.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Vec2___destroy___0(self);
};
// b2Vec3
function b2Vec3(arg0, arg1, arg2) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Vec3_b2Vec3_0(); getCache(b2Vec3)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Vec3_b2Vec3_1(arg0); getCache(b2Vec3)[this.ptr] = this;return }
  if (arg2 === undefined) { this.ptr = _emscripten_bind_b2Vec3_b2Vec3_2(arg0, arg1); getCache(b2Vec3)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Vec3_b2Vec3_3(arg0, arg1, arg2);
  getCache(b2Vec3)[this.ptr] = this;
};;
b2Vec3.prototype = Object.create(WrapperObject.prototype);
b2Vec3.prototype.constructor = b2Vec3;
b2Vec3.prototype.__class__ = b2Vec3;
b2Vec3.__cache__ = {};
Module['b2Vec3'] = b2Vec3;

b2Vec3.prototype['SetZero'] = b2Vec3.prototype.SetZero = function() {
  var self = this.ptr;
  _emscripten_bind_b2Vec3_SetZero_0(self);
};;

b2Vec3.prototype['Set'] = b2Vec3.prototype.Set = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2Vec3_Set_3(self, arg0, arg1, arg2);
};;

b2Vec3.prototype['op_add'] = b2Vec3.prototype.op_add = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_op_add_1(self, arg0);
};;

b2Vec3.prototype['op_sub'] = b2Vec3.prototype.op_sub = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_op_sub_1(self, arg0);
};;

b2Vec3.prototype['op_mul'] = b2Vec3.prototype.op_mul = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_op_mul_1(self, arg0);
};;

  b2Vec3.prototype['get_x'] = b2Vec3.prototype.get_x = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec3_get_x_0(self);
};
    b2Vec3.prototype['set_x'] = b2Vec3.prototype.set_x = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_set_x_1(self, arg0);
};
  b2Vec3.prototype['get_y'] = b2Vec3.prototype.get_y = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec3_get_y_0(self);
};
    b2Vec3.prototype['set_y'] = b2Vec3.prototype.set_y = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_set_y_1(self, arg0);
};
  b2Vec3.prototype['get_z'] = b2Vec3.prototype.get_z = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec3_get_z_0(self);
};
    b2Vec3.prototype['set_z'] = b2Vec3.prototype.set_z = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_set_z_1(self, arg0);
};
  b2Vec3.prototype['__destroy__'] = b2Vec3.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Vec3___destroy___0(self);
};
// b2AABB
function b2AABB() {
  this.ptr = _emscripten_bind_b2AABB_b2AABB_0();
  getCache(b2AABB)[this.ptr] = this;
};;
b2AABB.prototype = Object.create(WrapperObject.prototype);
b2AABB.prototype.constructor = b2AABB;
b2AABB.prototype.__class__ = b2AABB;
b2AABB.__cache__ = {};
Module['b2AABB'] = b2AABB;

b2AABB.prototype['IsValid'] = b2AABB.prototype.IsValid = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2AABB_IsValid_0(self));
};;

b2AABB.prototype['GetCenter'] = b2AABB.prototype.GetCenter = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2AABB_GetCenter_0(self), b2Vec2);
};;

b2AABB.prototype['GetExtents'] = b2AABB.prototype.GetExtents = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2AABB_GetExtents_0(self), b2Vec2);
};;

b2AABB.prototype['GetPerimeter'] = b2AABB.prototype.GetPerimeter = function() {
  var self = this.ptr;
  return _emscripten_bind_b2AABB_GetPerimeter_0(self);
};;

b2AABB.prototype['Combine'] = b2AABB.prototype.Combine = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg1 === undefined) { _emscripten_bind_b2AABB_Combine_1(self, arg0);  return }
  _emscripten_bind_b2AABB_Combine_2(self, arg0, arg1);
};;

b2AABB.prototype['Contains'] = b2AABB.prototype.Contains = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return !!(_emscripten_bind_b2AABB_Contains_1(self, arg0));
};;

b2AABB.prototype['RayCast'] = b2AABB.prototype.RayCast = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2AABB_RayCast_2(self, arg0, arg1));
};;

  b2AABB.prototype['get_lowerBound'] = b2AABB.prototype.get_lowerBound = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2AABB_get_lowerBound_0(self), b2Vec2);
};
    b2AABB.prototype['set_lowerBound'] = b2AABB.prototype.set_lowerBound = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2AABB_set_lowerBound_1(self, arg0);
};
  b2AABB.prototype['get_upperBound'] = b2AABB.prototype.get_upperBound = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2AABB_get_upperBound_0(self), b2Vec2);
};
    b2AABB.prototype['set_upperBound'] = b2AABB.prototype.set_upperBound = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2AABB_set_upperBound_1(self, arg0);
};
  b2AABB.prototype['__destroy__'] = b2AABB.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2AABB___destroy___0(self);
};
// b2FixtureDef
function b2FixtureDef() {
  this.ptr = _emscripten_bind_b2FixtureDef_b2FixtureDef_0();
  getCache(b2FixtureDef)[this.ptr] = this;
};;
b2FixtureDef.prototype = Object.create(WrapperObject.prototype);
b2FixtureDef.prototype.constructor = b2FixtureDef;
b2FixtureDef.prototype.__class__ = b2FixtureDef;
b2FixtureDef.__cache__ = {};
Module['b2FixtureDef'] = b2FixtureDef;

  b2FixtureDef.prototype['get_shape'] = b2FixtureDef.prototype.get_shape = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FixtureDef_get_shape_0(self), b2Shape);
};
    b2FixtureDef.prototype['set_shape'] = b2FixtureDef.prototype.set_shape = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_shape_1(self, arg0);
};
  b2FixtureDef.prototype['get_userData'] = b2FixtureDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FixtureDef_get_userData_0(self);
};
    b2FixtureDef.prototype['set_userData'] = b2FixtureDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_userData_1(self, arg0);
};
  b2FixtureDef.prototype['get_friction'] = b2FixtureDef.prototype.get_friction = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FixtureDef_get_friction_0(self);
};
    b2FixtureDef.prototype['set_friction'] = b2FixtureDef.prototype.set_friction = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_friction_1(self, arg0);
};
  b2FixtureDef.prototype['get_restitution'] = b2FixtureDef.prototype.get_restitution = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FixtureDef_get_restitution_0(self);
};
    b2FixtureDef.prototype['set_restitution'] = b2FixtureDef.prototype.set_restitution = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_restitution_1(self, arg0);
};
  b2FixtureDef.prototype['get_density'] = b2FixtureDef.prototype.get_density = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FixtureDef_get_density_0(self);
};
    b2FixtureDef.prototype['set_density'] = b2FixtureDef.prototype.set_density = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_density_1(self, arg0);
};
  b2FixtureDef.prototype['get_isSensor'] = b2FixtureDef.prototype.get_isSensor = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2FixtureDef_get_isSensor_0(self));
};
    b2FixtureDef.prototype['set_isSensor'] = b2FixtureDef.prototype.set_isSensor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_isSensor_1(self, arg0);
};
  b2FixtureDef.prototype['get_filter'] = b2FixtureDef.prototype.get_filter = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FixtureDef_get_filter_0(self), b2Filter);
};
    b2FixtureDef.prototype['set_filter'] = b2FixtureDef.prototype.set_filter = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_filter_1(self, arg0);
};
  b2FixtureDef.prototype['__destroy__'] = b2FixtureDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2FixtureDef___destroy___0(self);
};
// b2FrictionJointDef
function b2FrictionJointDef() {
  this.ptr = _emscripten_bind_b2FrictionJointDef_b2FrictionJointDef_0();
  getCache(b2FrictionJointDef)[this.ptr] = this;
};;
b2FrictionJointDef.prototype = Object.create(b2JointDef.prototype);
b2FrictionJointDef.prototype.constructor = b2FrictionJointDef;
b2FrictionJointDef.prototype.__class__ = b2FrictionJointDef;
b2FrictionJointDef.__cache__ = {};
Module['b2FrictionJointDef'] = b2FrictionJointDef;

b2FrictionJointDef.prototype['Initialize'] = b2FrictionJointDef.prototype.Initialize = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2FrictionJointDef_Initialize_3(self, arg0, arg1, arg2);
};;

  b2FrictionJointDef.prototype['get_localAnchorA'] = b2FrictionJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2FrictionJointDef.prototype['set_localAnchorA'] = b2FrictionJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_localAnchorA_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_localAnchorB'] = b2FrictionJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2FrictionJointDef.prototype['set_localAnchorB'] = b2FrictionJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_localAnchorB_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_maxForce'] = b2FrictionJointDef.prototype.get_maxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJointDef_get_maxForce_0(self);
};
    b2FrictionJointDef.prototype['set_maxForce'] = b2FrictionJointDef.prototype.set_maxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_maxForce_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_maxTorque'] = b2FrictionJointDef.prototype.get_maxTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJointDef_get_maxTorque_0(self);
};
    b2FrictionJointDef.prototype['set_maxTorque'] = b2FrictionJointDef.prototype.set_maxTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_maxTorque_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_type'] = b2FrictionJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJointDef_get_type_0(self);
};
    b2FrictionJointDef.prototype['set_type'] = b2FrictionJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_type_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_userData'] = b2FrictionJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJointDef_get_userData_0(self);
};
    b2FrictionJointDef.prototype['set_userData'] = b2FrictionJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_userData_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_bodyA'] = b2FrictionJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJointDef_get_bodyA_0(self), b2Body);
};
    b2FrictionJointDef.prototype['set_bodyA'] = b2FrictionJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_bodyA_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_bodyB'] = b2FrictionJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJointDef_get_bodyB_0(self), b2Body);
};
    b2FrictionJointDef.prototype['set_bodyB'] = b2FrictionJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_bodyB_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_collideConnected'] = b2FrictionJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2FrictionJointDef_get_collideConnected_0(self));
};
    b2FrictionJointDef.prototype['set_collideConnected'] = b2FrictionJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_collideConnected_1(self, arg0);
};
  b2FrictionJointDef.prototype['__destroy__'] = b2FrictionJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2FrictionJointDef___destroy___0(self);
};
// b2Manifold
function b2Manifold() {
  this.ptr = _emscripten_bind_b2Manifold_b2Manifold_0();
  getCache(b2Manifold)[this.ptr] = this;
};;
b2Manifold.prototype = Object.create(WrapperObject.prototype);
b2Manifold.prototype.constructor = b2Manifold;
b2Manifold.prototype.__class__ = b2Manifold;
b2Manifold.__cache__ = {};
Module['b2Manifold'] = b2Manifold;

  b2Manifold.prototype['get_localNormal'] = b2Manifold.prototype.get_localNormal = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Manifold_get_localNormal_0(self), b2Vec2);
};
    b2Manifold.prototype['set_localNormal'] = b2Manifold.prototype.set_localNormal = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Manifold_set_localNormal_1(self, arg0);
};
  b2Manifold.prototype['get_localPoint'] = b2Manifold.prototype.get_localPoint = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Manifold_get_localPoint_0(self), b2Vec2);
};
    b2Manifold.prototype['set_localPoint'] = b2Manifold.prototype.set_localPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Manifold_set_localPoint_1(self, arg0);
};
  b2Manifold.prototype['get_type'] = b2Manifold.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Manifold_get_type_0(self);
};
    b2Manifold.prototype['set_type'] = b2Manifold.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Manifold_set_type_1(self, arg0);
};
  b2Manifold.prototype['get_pointCount'] = b2Manifold.prototype.get_pointCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Manifold_get_pointCount_0(self);
};
    b2Manifold.prototype['set_pointCount'] = b2Manifold.prototype.set_pointCount = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Manifold_set_pointCount_1(self, arg0);
};
  b2Manifold.prototype['__destroy__'] = b2Manifold.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Manifold___destroy___0(self);
};
// b2PrismaticJointDef
function b2PrismaticJointDef() {
  this.ptr = _emscripten_bind_b2PrismaticJointDef_b2PrismaticJointDef_0();
  getCache(b2PrismaticJointDef)[this.ptr] = this;
};;
b2PrismaticJointDef.prototype = Object.create(b2JointDef.prototype);
b2PrismaticJointDef.prototype.constructor = b2PrismaticJointDef;
b2PrismaticJointDef.prototype.__class__ = b2PrismaticJointDef;
b2PrismaticJointDef.__cache__ = {};
Module['b2PrismaticJointDef'] = b2PrismaticJointDef;

b2PrismaticJointDef.prototype['Initialize'] = b2PrismaticJointDef.prototype.Initialize = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  _emscripten_bind_b2PrismaticJointDef_Initialize_4(self, arg0, arg1, arg2, arg3);
};;

  b2PrismaticJointDef.prototype['get_localAnchorA'] = b2PrismaticJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2PrismaticJointDef.prototype['set_localAnchorA'] = b2PrismaticJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_localAnchorA_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_localAnchorB'] = b2PrismaticJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2PrismaticJointDef.prototype['set_localAnchorB'] = b2PrismaticJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_localAnchorB_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_localAxisA'] = b2PrismaticJointDef.prototype.get_localAxisA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJointDef_get_localAxisA_0(self), b2Vec2);
};
    b2PrismaticJointDef.prototype['set_localAxisA'] = b2PrismaticJointDef.prototype.set_localAxisA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_localAxisA_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_referenceAngle'] = b2PrismaticJointDef.prototype.get_referenceAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_referenceAngle_0(self);
};
    b2PrismaticJointDef.prototype['set_referenceAngle'] = b2PrismaticJointDef.prototype.set_referenceAngle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_referenceAngle_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_enableLimit'] = b2PrismaticJointDef.prototype.get_enableLimit = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJointDef_get_enableLimit_0(self));
};
    b2PrismaticJointDef.prototype['set_enableLimit'] = b2PrismaticJointDef.prototype.set_enableLimit = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_enableLimit_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_lowerTranslation'] = b2PrismaticJointDef.prototype.get_lowerTranslation = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_lowerTranslation_0(self);
};
    b2PrismaticJointDef.prototype['set_lowerTranslation'] = b2PrismaticJointDef.prototype.set_lowerTranslation = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_lowerTranslation_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_upperTranslation'] = b2PrismaticJointDef.prototype.get_upperTranslation = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_upperTranslation_0(self);
};
    b2PrismaticJointDef.prototype['set_upperTranslation'] = b2PrismaticJointDef.prototype.set_upperTranslation = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_upperTranslation_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_enableMotor'] = b2PrismaticJointDef.prototype.get_enableMotor = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJointDef_get_enableMotor_0(self));
};
    b2PrismaticJointDef.prototype['set_enableMotor'] = b2PrismaticJointDef.prototype.set_enableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_enableMotor_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_maxMotorForce'] = b2PrismaticJointDef.prototype.get_maxMotorForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_maxMotorForce_0(self);
};
    b2PrismaticJointDef.prototype['set_maxMotorForce'] = b2PrismaticJointDef.prototype.set_maxMotorForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_maxMotorForce_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_motorSpeed'] = b2PrismaticJointDef.prototype.get_motorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_motorSpeed_0(self);
};
    b2PrismaticJointDef.prototype['set_motorSpeed'] = b2PrismaticJointDef.prototype.set_motorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_motorSpeed_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_type'] = b2PrismaticJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_type_0(self);
};
    b2PrismaticJointDef.prototype['set_type'] = b2PrismaticJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_type_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_userData'] = b2PrismaticJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_userData_0(self);
};
    b2PrismaticJointDef.prototype['set_userData'] = b2PrismaticJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_userData_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_bodyA'] = b2PrismaticJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJointDef_get_bodyA_0(self), b2Body);
};
    b2PrismaticJointDef.prototype['set_bodyA'] = b2PrismaticJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_bodyA_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_bodyB'] = b2PrismaticJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJointDef_get_bodyB_0(self), b2Body);
};
    b2PrismaticJointDef.prototype['set_bodyB'] = b2PrismaticJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_bodyB_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_collideConnected'] = b2PrismaticJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJointDef_get_collideConnected_0(self));
};
    b2PrismaticJointDef.prototype['set_collideConnected'] = b2PrismaticJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_collideConnected_1(self, arg0);
};
  b2PrismaticJointDef.prototype['__destroy__'] = b2PrismaticJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2PrismaticJointDef___destroy___0(self);
};
// b2World
function b2World(arg0) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  this.ptr = _emscripten_bind_b2World_b2World_1(arg0);
  getCache(b2World)[this.ptr] = this;
};;
b2World.prototype = Object.create(WrapperObject.prototype);
b2World.prototype.constructor = b2World;
b2World.prototype.__class__ = b2World;
b2World.__cache__ = {};
Module['b2World'] = b2World;

b2World.prototype['SetDestructionListener'] = b2World.prototype.SetDestructionListener = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetDestructionListener_1(self, arg0);
};;

b2World.prototype['SetContactFilter'] = b2World.prototype.SetContactFilter = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetContactFilter_1(self, arg0);
};;

b2World.prototype['SetContactListener'] = b2World.prototype.SetContactListener = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetContactListener_1(self, arg0);
};;

b2World.prototype['SetDebugDraw'] = b2World.prototype.SetDebugDraw = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetDebugDraw_1(self, arg0);
};;

b2World.prototype['CreateBody'] = b2World.prototype.CreateBody = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2World_CreateBody_1(self, arg0), b2Body);
};;

b2World.prototype['DestroyBody'] = b2World.prototype.DestroyBody = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_DestroyBody_1(self, arg0);
};;

b2World.prototype['CreateJoint'] = b2World.prototype.CreateJoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2World_CreateJoint_1(self, arg0), b2Joint);
};;

b2World.prototype['DestroyJoint'] = b2World.prototype.DestroyJoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_DestroyJoint_1(self, arg0);
};;

b2World.prototype['Step'] = b2World.prototype.Step = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2World_Step_3(self, arg0, arg1, arg2);
};;

b2World.prototype['ClearForces'] = b2World.prototype.ClearForces = function() {
  var self = this.ptr;
  _emscripten_bind_b2World_ClearForces_0(self);
};;

b2World.prototype['DrawDebugData'] = b2World.prototype.DrawDebugData = function() {
  var self = this.ptr;
  _emscripten_bind_b2World_DrawDebugData_0(self);
};;

b2World.prototype['QueryAABB'] = b2World.prototype.QueryAABB = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2World_QueryAABB_2(self, arg0, arg1);
};;

b2World.prototype['RayCast'] = b2World.prototype.RayCast = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2World_RayCast_3(self, arg0, arg1, arg2);
};;

b2World.prototype['GetBodyList'] = b2World.prototype.GetBodyList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2World_GetBodyList_0(self), b2Body);
};;

b2World.prototype['GetJointList'] = b2World.prototype.GetJointList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2World_GetJointList_0(self), b2Joint);
};;

b2World.prototype['GetContactList'] = b2World.prototype.GetContactList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2World_GetContactList_0(self), b2Contact);
};;

b2World.prototype['SetAllowSleeping'] = b2World.prototype.SetAllowSleeping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetAllowSleeping_1(self, arg0);
};;

b2World.prototype['GetAllowSleeping'] = b2World.prototype.GetAllowSleeping = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_GetAllowSleeping_0(self));
};;

b2World.prototype['SetWarmStarting'] = b2World.prototype.SetWarmStarting = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetWarmStarting_1(self, arg0);
};;

b2World.prototype['GetWarmStarting'] = b2World.prototype.GetWarmStarting = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_GetWarmStarting_0(self));
};;

b2World.prototype['SetContinuousPhysics'] = b2World.prototype.SetContinuousPhysics = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetContinuousPhysics_1(self, arg0);
};;

b2World.prototype['GetContinuousPhysics'] = b2World.prototype.GetContinuousPhysics = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_GetContinuousPhysics_0(self));
};;

b2World.prototype['SetSubStepping'] = b2World.prototype.SetSubStepping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetSubStepping_1(self, arg0);
};;

b2World.prototype['GetSubStepping'] = b2World.prototype.GetSubStepping = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_GetSubStepping_0(self));
};;

b2World.prototype['GetProxyCount'] = b2World.prototype.GetProxyCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetProxyCount_0(self);
};;

b2World.prototype['GetBodyCount'] = b2World.prototype.GetBodyCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetBodyCount_0(self);
};;

b2World.prototype['GetJointCount'] = b2World.prototype.GetJointCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetJointCount_0(self);
};;

b2World.prototype['GetContactCount'] = b2World.prototype.GetContactCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetContactCount_0(self);
};;

b2World.prototype['GetTreeHeight'] = b2World.prototype.GetTreeHeight = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetTreeHeight_0(self);
};;

b2World.prototype['GetTreeBalance'] = b2World.prototype.GetTreeBalance = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetTreeBalance_0(self);
};;

b2World.prototype['GetTreeQuality'] = b2World.prototype.GetTreeQuality = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetTreeQuality_0(self);
};;

b2World.prototype['SetGravity'] = b2World.prototype.SetGravity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetGravity_1(self, arg0);
};;

b2World.prototype['GetGravity'] = b2World.prototype.GetGravity = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2World_GetGravity_0(self), b2Vec2);
};;

b2World.prototype['IsLocked'] = b2World.prototype.IsLocked = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_IsLocked_0(self));
};;

b2World.prototype['SetAutoClearForces'] = b2World.prototype.SetAutoClearForces = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetAutoClearForces_1(self, arg0);
};;

b2World.prototype['GetAutoClearForces'] = b2World.prototype.GetAutoClearForces = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_GetAutoClearForces_0(self));
};;

b2World.prototype['GetProfile'] = b2World.prototype.GetProfile = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2World_GetProfile_0(self), b2Profile);
};;

b2World.prototype['Dump'] = b2World.prototype.Dump = function() {
  var self = this.ptr;
  _emscripten_bind_b2World_Dump_0(self);
};;

  b2World.prototype['__destroy__'] = b2World.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2World___destroy___0(self);
};
// b2PrismaticJoint
function b2PrismaticJoint() { throw "cannot construct a b2PrismaticJoint, no constructor in IDL" }
b2PrismaticJoint.prototype = Object.create(b2Joint.prototype);
b2PrismaticJoint.prototype.constructor = b2PrismaticJoint;
b2PrismaticJoint.prototype.__class__ = b2PrismaticJoint;
b2PrismaticJoint.__cache__ = {};
Module['b2PrismaticJoint'] = b2PrismaticJoint;

b2PrismaticJoint.prototype['GetLocalAnchorA'] = b2PrismaticJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2PrismaticJoint.prototype['GetLocalAnchorB'] = b2PrismaticJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2PrismaticJoint.prototype['GetLocalAxisA'] = b2PrismaticJoint.prototype.GetLocalAxisA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetLocalAxisA_0(self), b2Vec2);
};;

b2PrismaticJoint.prototype['GetReferenceAngle'] = b2PrismaticJoint.prototype.GetReferenceAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetReferenceAngle_0(self);
};;

b2PrismaticJoint.prototype['GetJointTranslation'] = b2PrismaticJoint.prototype.GetJointTranslation = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetJointTranslation_0(self);
};;

b2PrismaticJoint.prototype['GetJointSpeed'] = b2PrismaticJoint.prototype.GetJointSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetJointSpeed_0(self);
};;

b2PrismaticJoint.prototype['IsLimitEnabled'] = b2PrismaticJoint.prototype.IsLimitEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJoint_IsLimitEnabled_0(self));
};;

b2PrismaticJoint.prototype['EnableLimit'] = b2PrismaticJoint.prototype.EnableLimit = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJoint_EnableLimit_1(self, arg0);
};;

b2PrismaticJoint.prototype['GetLowerLimit'] = b2PrismaticJoint.prototype.GetLowerLimit = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetLowerLimit_0(self);
};;

b2PrismaticJoint.prototype['GetUpperLimit'] = b2PrismaticJoint.prototype.GetUpperLimit = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetUpperLimit_0(self);
};;

b2PrismaticJoint.prototype['SetLimits'] = b2PrismaticJoint.prototype.SetLimits = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2PrismaticJoint_SetLimits_2(self, arg0, arg1);
};;

b2PrismaticJoint.prototype['IsMotorEnabled'] = b2PrismaticJoint.prototype.IsMotorEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJoint_IsMotorEnabled_0(self));
};;

b2PrismaticJoint.prototype['EnableMotor'] = b2PrismaticJoint.prototype.EnableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJoint_EnableMotor_1(self, arg0);
};;

b2PrismaticJoint.prototype['SetMotorSpeed'] = b2PrismaticJoint.prototype.SetMotorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJoint_SetMotorSpeed_1(self, arg0);
};;

b2PrismaticJoint.prototype['GetMotorSpeed'] = b2PrismaticJoint.prototype.GetMotorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetMotorSpeed_0(self);
};;

b2PrismaticJoint.prototype['SetMaxMotorForce'] = b2PrismaticJoint.prototype.SetMaxMotorForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJoint_SetMaxMotorForce_1(self, arg0);
};;

b2PrismaticJoint.prototype['GetMaxMotorForce'] = b2PrismaticJoint.prototype.GetMaxMotorForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetMaxMotorForce_0(self);
};;

b2PrismaticJoint.prototype['GetMotorForce'] = b2PrismaticJoint.prototype.GetMotorForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetMotorForce_1(self, arg0);
};;

b2PrismaticJoint.prototype['GetType'] = b2PrismaticJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetType_0(self);
};;

b2PrismaticJoint.prototype['GetBodyA'] = b2PrismaticJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetBodyA_0(self), b2Body);
};;

b2PrismaticJoint.prototype['GetBodyB'] = b2PrismaticJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetBodyB_0(self), b2Body);
};;

b2PrismaticJoint.prototype['GetAnchorA'] = b2PrismaticJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetAnchorA_0(self), b2Vec2);
};;

b2PrismaticJoint.prototype['GetAnchorB'] = b2PrismaticJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetAnchorB_0(self), b2Vec2);
};;

b2PrismaticJoint.prototype['GetReactionForce'] = b2PrismaticJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2PrismaticJoint.prototype['GetReactionTorque'] = b2PrismaticJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetReactionTorque_1(self, arg0);
};;

b2PrismaticJoint.prototype['GetNext'] = b2PrismaticJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetNext_0(self), b2Joint);
};;

b2PrismaticJoint.prototype['GetUserData'] = b2PrismaticJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetUserData_0(self);
};;

b2PrismaticJoint.prototype['SetUserData'] = b2PrismaticJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJoint_SetUserData_1(self, arg0);
};;

b2PrismaticJoint.prototype['IsActive'] = b2PrismaticJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJoint_IsActive_0(self));
};;

b2PrismaticJoint.prototype['GetCollideConnected'] = b2PrismaticJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJoint_GetCollideConnected_0(self));
};;

  b2PrismaticJoint.prototype['__destroy__'] = b2PrismaticJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2PrismaticJoint___destroy___0(self);
};
// b2RayCastOutput
function b2RayCastOutput() { throw "cannot construct a b2RayCastOutput, no constructor in IDL" }
b2RayCastOutput.prototype = Object.create(WrapperObject.prototype);
b2RayCastOutput.prototype.constructor = b2RayCastOutput;
b2RayCastOutput.prototype.__class__ = b2RayCastOutput;
b2RayCastOutput.__cache__ = {};
Module['b2RayCastOutput'] = b2RayCastOutput;

  b2RayCastOutput.prototype['get_normal'] = b2RayCastOutput.prototype.get_normal = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RayCastOutput_get_normal_0(self), b2Vec2);
};
    b2RayCastOutput.prototype['set_normal'] = b2RayCastOutput.prototype.set_normal = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RayCastOutput_set_normal_1(self, arg0);
};
  b2RayCastOutput.prototype['get_fraction'] = b2RayCastOutput.prototype.get_fraction = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RayCastOutput_get_fraction_0(self);
};
    b2RayCastOutput.prototype['set_fraction'] = b2RayCastOutput.prototype.set_fraction = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RayCastOutput_set_fraction_1(self, arg0);
};
  b2RayCastOutput.prototype['__destroy__'] = b2RayCastOutput.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RayCastOutput___destroy___0(self);
};
// b2ContactID
function b2ContactID() { throw "cannot construct a b2ContactID, no constructor in IDL" }
b2ContactID.prototype = Object.create(WrapperObject.prototype);
b2ContactID.prototype.constructor = b2ContactID;
b2ContactID.prototype.__class__ = b2ContactID;
b2ContactID.__cache__ = {};
Module['b2ContactID'] = b2ContactID;

  b2ContactID.prototype['get_cf'] = b2ContactID.prototype.get_cf = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ContactID_get_cf_0(self), b2ContactFeature);
};
    b2ContactID.prototype['set_cf'] = b2ContactID.prototype.set_cf = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactID_set_cf_1(self, arg0);
};
  b2ContactID.prototype['get_key'] = b2ContactID.prototype.get_key = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactID_get_key_0(self);
};
    b2ContactID.prototype['set_key'] = b2ContactID.prototype.set_key = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactID_set_key_1(self, arg0);
};
  b2ContactID.prototype['__destroy__'] = b2ContactID.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactID___destroy___0(self);
};
// JSContactListener
function JSContactListener() {
  this.ptr = _emscripten_bind_JSContactListener_JSContactListener_0();
  getCache(JSContactListener)[this.ptr] = this;
};;
JSContactListener.prototype = Object.create(b2ContactListener.prototype);
JSContactListener.prototype.constructor = JSContactListener;
JSContactListener.prototype.__class__ = JSContactListener;
JSContactListener.__cache__ = {};
Module['JSContactListener'] = JSContactListener;

JSContactListener.prototype['BeginContact'] = JSContactListener.prototype.BeginContact = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_JSContactListener_BeginContact_1(self, arg0);
};;

JSContactListener.prototype['EndContact'] = JSContactListener.prototype.EndContact = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_JSContactListener_EndContact_1(self, arg0);
};;

JSContactListener.prototype['PreSolve'] = JSContactListener.prototype.PreSolve = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_JSContactListener_PreSolve_2(self, arg0, arg1);
};;

JSContactListener.prototype['PostSolve'] = JSContactListener.prototype.PostSolve = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_JSContactListener_PostSolve_2(self, arg0, arg1);
};;

  JSContactListener.prototype['__destroy__'] = JSContactListener.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSContactListener___destroy___0(self);
};
// b2Mat22
function b2Mat22(arg0, arg1, arg2, arg3) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Mat22_b2Mat22_0(); getCache(b2Mat22)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Mat22_b2Mat22_1(arg0); getCache(b2Mat22)[this.ptr] = this;return }
  if (arg2 === undefined) { this.ptr = _emscripten_bind_b2Mat22_b2Mat22_2(arg0, arg1); getCache(b2Mat22)[this.ptr] = this;return }
  if (arg3 === undefined) { this.ptr = _emscripten_bind_b2Mat22_b2Mat22_3(arg0, arg1, arg2); getCache(b2Mat22)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Mat22_b2Mat22_4(arg0, arg1, arg2, arg3);
  getCache(b2Mat22)[this.ptr] = this;
};;
b2Mat22.prototype = Object.create(WrapperObject.prototype);
b2Mat22.prototype.constructor = b2Mat22;
b2Mat22.prototype.__class__ = b2Mat22;
b2Mat22.__cache__ = {};
Module['b2Mat22'] = b2Mat22;

b2Mat22.prototype['Set'] = b2Mat22.prototype.Set = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Mat22_Set_2(self, arg0, arg1);
};;

b2Mat22.prototype['SetIdentity'] = b2Mat22.prototype.SetIdentity = function() {
  var self = this.ptr;
  _emscripten_bind_b2Mat22_SetIdentity_0(self);
};;

b2Mat22.prototype['SetZero'] = b2Mat22.prototype.SetZero = function() {
  var self = this.ptr;
  _emscripten_bind_b2Mat22_SetZero_0(self);
};;

b2Mat22.prototype['GetInverse'] = b2Mat22.prototype.GetInverse = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat22_GetInverse_0(self), b2Mat22);
};;

b2Mat22.prototype['Solve'] = b2Mat22.prototype.Solve = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Mat22_Solve_1(self, arg0), b2Vec2);
};;

  b2Mat22.prototype['get_ex'] = b2Mat22.prototype.get_ex = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat22_get_ex_0(self), b2Vec2);
};
    b2Mat22.prototype['set_ex'] = b2Mat22.prototype.set_ex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat22_set_ex_1(self, arg0);
};
  b2Mat22.prototype['get_ey'] = b2Mat22.prototype.get_ey = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat22_get_ey_0(self), b2Vec2);
};
    b2Mat22.prototype['set_ey'] = b2Mat22.prototype.set_ey = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat22_set_ey_1(self, arg0);
};
  b2Mat22.prototype['__destroy__'] = b2Mat22.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Mat22___destroy___0(self);
};
// b2WheelJointDef
function b2WheelJointDef() {
  this.ptr = _emscripten_bind_b2WheelJointDef_b2WheelJointDef_0();
  getCache(b2WheelJointDef)[this.ptr] = this;
};;
b2WheelJointDef.prototype = Object.create(b2JointDef.prototype);
b2WheelJointDef.prototype.constructor = b2WheelJointDef;
b2WheelJointDef.prototype.__class__ = b2WheelJointDef;
b2WheelJointDef.__cache__ = {};
Module['b2WheelJointDef'] = b2WheelJointDef;

b2WheelJointDef.prototype['Initialize'] = b2WheelJointDef.prototype.Initialize = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  _emscripten_bind_b2WheelJointDef_Initialize_4(self, arg0, arg1, arg2, arg3);
};;

  b2WheelJointDef.prototype['get_localAnchorA'] = b2WheelJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2WheelJointDef.prototype['set_localAnchorA'] = b2WheelJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_localAnchorA_1(self, arg0);
};
  b2WheelJointDef.prototype['get_localAnchorB'] = b2WheelJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2WheelJointDef.prototype['set_localAnchorB'] = b2WheelJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_localAnchorB_1(self, arg0);
};
  b2WheelJointDef.prototype['get_localAxisA'] = b2WheelJointDef.prototype.get_localAxisA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJointDef_get_localAxisA_0(self), b2Vec2);
};
    b2WheelJointDef.prototype['set_localAxisA'] = b2WheelJointDef.prototype.set_localAxisA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_localAxisA_1(self, arg0);
};
  b2WheelJointDef.prototype['get_enableMotor'] = b2WheelJointDef.prototype.get_enableMotor = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WheelJointDef_get_enableMotor_0(self));
};
    b2WheelJointDef.prototype['set_enableMotor'] = b2WheelJointDef.prototype.set_enableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_enableMotor_1(self, arg0);
};
  b2WheelJointDef.prototype['get_maxMotorTorque'] = b2WheelJointDef.prototype.get_maxMotorTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_maxMotorTorque_0(self);
};
    b2WheelJointDef.prototype['set_maxMotorTorque'] = b2WheelJointDef.prototype.set_maxMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_maxMotorTorque_1(self, arg0);
};
  b2WheelJointDef.prototype['get_motorSpeed'] = b2WheelJointDef.prototype.get_motorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_motorSpeed_0(self);
};
    b2WheelJointDef.prototype['set_motorSpeed'] = b2WheelJointDef.prototype.set_motorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_motorSpeed_1(self, arg0);
};
  b2WheelJointDef.prototype['get_frequencyHz'] = b2WheelJointDef.prototype.get_frequencyHz = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_frequencyHz_0(self);
};
    b2WheelJointDef.prototype['set_frequencyHz'] = b2WheelJointDef.prototype.set_frequencyHz = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_frequencyHz_1(self, arg0);
};
  b2WheelJointDef.prototype['get_dampingRatio'] = b2WheelJointDef.prototype.get_dampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_dampingRatio_0(self);
};
    b2WheelJointDef.prototype['set_dampingRatio'] = b2WheelJointDef.prototype.set_dampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_dampingRatio_1(self, arg0);
};
  b2WheelJointDef.prototype['get_type'] = b2WheelJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_type_0(self);
};
    b2WheelJointDef.prototype['set_type'] = b2WheelJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_type_1(self, arg0);
};
  b2WheelJointDef.prototype['get_userData'] = b2WheelJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_userData_0(self);
};
    b2WheelJointDef.prototype['set_userData'] = b2WheelJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_userData_1(self, arg0);
};
  b2WheelJointDef.prototype['get_bodyA'] = b2WheelJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJointDef_get_bodyA_0(self), b2Body);
};
    b2WheelJointDef.prototype['set_bodyA'] = b2WheelJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_bodyA_1(self, arg0);
};
  b2WheelJointDef.prototype['get_bodyB'] = b2WheelJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJointDef_get_bodyB_0(self), b2Body);
};
    b2WheelJointDef.prototype['set_bodyB'] = b2WheelJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_bodyB_1(self, arg0);
};
  b2WheelJointDef.prototype['get_collideConnected'] = b2WheelJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WheelJointDef_get_collideConnected_0(self));
};
    b2WheelJointDef.prototype['set_collideConnected'] = b2WheelJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_collideConnected_1(self, arg0);
};
  b2WheelJointDef.prototype['__destroy__'] = b2WheelJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2WheelJointDef___destroy___0(self);
};
// b2CircleShape
function b2CircleShape() {
  this.ptr = _emscripten_bind_b2CircleShape_b2CircleShape_0();
  getCache(b2CircleShape)[this.ptr] = this;
};;
b2CircleShape.prototype = Object.create(b2Shape.prototype);
b2CircleShape.prototype.constructor = b2CircleShape;
b2CircleShape.prototype.__class__ = b2CircleShape;
b2CircleShape.__cache__ = {};
Module['b2CircleShape'] = b2CircleShape;

b2CircleShape.prototype['GetType'] = b2CircleShape.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2CircleShape_GetType_0(self);
};;

b2CircleShape.prototype['GetChildCount'] = b2CircleShape.prototype.GetChildCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2CircleShape_GetChildCount_0(self);
};;

b2CircleShape.prototype['TestPoint'] = b2CircleShape.prototype.TestPoint = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2CircleShape_TestPoint_2(self, arg0, arg1));
};;

b2CircleShape.prototype['RayCast'] = b2CircleShape.prototype.RayCast = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return !!(_emscripten_bind_b2CircleShape_RayCast_4(self, arg0, arg1, arg2, arg3));
};;

b2CircleShape.prototype['ComputeAABB'] = b2CircleShape.prototype.ComputeAABB = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2CircleShape_ComputeAABB_3(self, arg0, arg1, arg2);
};;

b2CircleShape.prototype['ComputeMass'] = b2CircleShape.prototype.ComputeMass = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2CircleShape_ComputeMass_2(self, arg0, arg1);
};;

  b2CircleShape.prototype['get_m_p'] = b2CircleShape.prototype.get_m_p = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2CircleShape_get_m_p_0(self), b2Vec2);
};
    b2CircleShape.prototype['set_m_p'] = b2CircleShape.prototype.set_m_p = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2CircleShape_set_m_p_1(self, arg0);
};
  b2CircleShape.prototype['get_m_type'] = b2CircleShape.prototype.get_m_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2CircleShape_get_m_type_0(self);
};
    b2CircleShape.prototype['set_m_type'] = b2CircleShape.prototype.set_m_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2CircleShape_set_m_type_1(self, arg0);
};
  b2CircleShape.prototype['get_m_radius'] = b2CircleShape.prototype.get_m_radius = function() {
  var self = this.ptr;
  return _emscripten_bind_b2CircleShape_get_m_radius_0(self);
};
    b2CircleShape.prototype['set_m_radius'] = b2CircleShape.prototype.set_m_radius = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2CircleShape_set_m_radius_1(self, arg0);
};
  b2CircleShape.prototype['__destroy__'] = b2CircleShape.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2CircleShape___destroy___0(self);
};
// b2WeldJointDef
function b2WeldJointDef() {
  this.ptr = _emscripten_bind_b2WeldJointDef_b2WeldJointDef_0();
  getCache(b2WeldJointDef)[this.ptr] = this;
};;
b2WeldJointDef.prototype = Object.create(b2JointDef.prototype);
b2WeldJointDef.prototype.constructor = b2WeldJointDef;
b2WeldJointDef.prototype.__class__ = b2WeldJointDef;
b2WeldJointDef.__cache__ = {};
Module['b2WeldJointDef'] = b2WeldJointDef;

b2WeldJointDef.prototype['Initialize'] = b2WeldJointDef.prototype.Initialize = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2WeldJointDef_Initialize_3(self, arg0, arg1, arg2);
};;

  b2WeldJointDef.prototype['get_localAnchorA'] = b2WeldJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2WeldJointDef.prototype['set_localAnchorA'] = b2WeldJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_localAnchorA_1(self, arg0);
};
  b2WeldJointDef.prototype['get_localAnchorB'] = b2WeldJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2WeldJointDef.prototype['set_localAnchorB'] = b2WeldJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_localAnchorB_1(self, arg0);
};
  b2WeldJointDef.prototype['get_referenceAngle'] = b2WeldJointDef.prototype.get_referenceAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJointDef_get_referenceAngle_0(self);
};
    b2WeldJointDef.prototype['set_referenceAngle'] = b2WeldJointDef.prototype.set_referenceAngle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_referenceAngle_1(self, arg0);
};
  b2WeldJointDef.prototype['get_frequencyHz'] = b2WeldJointDef.prototype.get_frequencyHz = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJointDef_get_frequencyHz_0(self);
};
    b2WeldJointDef.prototype['set_frequencyHz'] = b2WeldJointDef.prototype.set_frequencyHz = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_frequencyHz_1(self, arg0);
};
  b2WeldJointDef.prototype['get_dampingRatio'] = b2WeldJointDef.prototype.get_dampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJointDef_get_dampingRatio_0(self);
};
    b2WeldJointDef.prototype['set_dampingRatio'] = b2WeldJointDef.prototype.set_dampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_dampingRatio_1(self, arg0);
};
  b2WeldJointDef.prototype['get_type'] = b2WeldJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJointDef_get_type_0(self);
};
    b2WeldJointDef.prototype['set_type'] = b2WeldJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_type_1(self, arg0);
};
  b2WeldJointDef.prototype['get_userData'] = b2WeldJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJointDef_get_userData_0(self);
};
    b2WeldJointDef.prototype['set_userData'] = b2WeldJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_userData_1(self, arg0);
};
  b2WeldJointDef.prototype['get_bodyA'] = b2WeldJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJointDef_get_bodyA_0(self), b2Body);
};
    b2WeldJointDef.prototype['set_bodyA'] = b2WeldJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_bodyA_1(self, arg0);
};
  b2WeldJointDef.prototype['get_bodyB'] = b2WeldJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJointDef_get_bodyB_0(self), b2Body);
};
    b2WeldJointDef.prototype['set_bodyB'] = b2WeldJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_bodyB_1(self, arg0);
};
  b2WeldJointDef.prototype['get_collideConnected'] = b2WeldJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WeldJointDef_get_collideConnected_0(self));
};
    b2WeldJointDef.prototype['set_collideConnected'] = b2WeldJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_collideConnected_1(self, arg0);
};
  b2WeldJointDef.prototype['__destroy__'] = b2WeldJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2WeldJointDef___destroy___0(self);
};
// b2MassData
function b2MassData() {
  this.ptr = _emscripten_bind_b2MassData_b2MassData_0();
  getCache(b2MassData)[this.ptr] = this;
};;
b2MassData.prototype = Object.create(WrapperObject.prototype);
b2MassData.prototype.constructor = b2MassData;
b2MassData.prototype.__class__ = b2MassData;
b2MassData.__cache__ = {};
Module['b2MassData'] = b2MassData;

  b2MassData.prototype['get_mass'] = b2MassData.prototype.get_mass = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MassData_get_mass_0(self);
};
    b2MassData.prototype['set_mass'] = b2MassData.prototype.set_mass = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MassData_set_mass_1(self, arg0);
};
  b2MassData.prototype['get_center'] = b2MassData.prototype.get_center = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MassData_get_center_0(self), b2Vec2);
};
    b2MassData.prototype['set_center'] = b2MassData.prototype.set_center = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MassData_set_center_1(self, arg0);
};
  b2MassData.prototype['get_I'] = b2MassData.prototype.get_I = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MassData_get_I_0(self);
};
    b2MassData.prototype['set_I'] = b2MassData.prototype.set_I = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MassData_set_I_1(self, arg0);
};
  b2MassData.prototype['__destroy__'] = b2MassData.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2MassData___destroy___0(self);
};
// b2GearJoint
function b2GearJoint() { throw "cannot construct a b2GearJoint, no constructor in IDL" }
b2GearJoint.prototype = Object.create(b2Joint.prototype);
b2GearJoint.prototype.constructor = b2GearJoint;
b2GearJoint.prototype.__class__ = b2GearJoint;
b2GearJoint.__cache__ = {};
Module['b2GearJoint'] = b2GearJoint;

b2GearJoint.prototype['GetJoint1'] = b2GearJoint.prototype.GetJoint1 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetJoint1_0(self), b2Joint);
};;

b2GearJoint.prototype['GetJoint2'] = b2GearJoint.prototype.GetJoint2 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetJoint2_0(self), b2Joint);
};;

b2GearJoint.prototype['SetRatio'] = b2GearJoint.prototype.SetRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJoint_SetRatio_1(self, arg0);
};;

b2GearJoint.prototype['GetRatio'] = b2GearJoint.prototype.GetRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJoint_GetRatio_0(self);
};;

b2GearJoint.prototype['GetType'] = b2GearJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJoint_GetType_0(self);
};;

b2GearJoint.prototype['GetBodyA'] = b2GearJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetBodyA_0(self), b2Body);
};;

b2GearJoint.prototype['GetBodyB'] = b2GearJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetBodyB_0(self), b2Body);
};;

b2GearJoint.prototype['GetAnchorA'] = b2GearJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetAnchorA_0(self), b2Vec2);
};;

b2GearJoint.prototype['GetAnchorB'] = b2GearJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetAnchorB_0(self), b2Vec2);
};;

b2GearJoint.prototype['GetReactionForce'] = b2GearJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2GearJoint.prototype['GetReactionTorque'] = b2GearJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2GearJoint_GetReactionTorque_1(self, arg0);
};;

b2GearJoint.prototype['GetNext'] = b2GearJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetNext_0(self), b2Joint);
};;

b2GearJoint.prototype['GetUserData'] = b2GearJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJoint_GetUserData_0(self);
};;

b2GearJoint.prototype['SetUserData'] = b2GearJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJoint_SetUserData_1(self, arg0);
};;

b2GearJoint.prototype['IsActive'] = b2GearJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2GearJoint_IsActive_0(self));
};;

b2GearJoint.prototype['GetCollideConnected'] = b2GearJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2GearJoint_GetCollideConnected_0(self));
};;

  b2GearJoint.prototype['__destroy__'] = b2GearJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2GearJoint___destroy___0(self);
};
// b2WeldJoint
function b2WeldJoint() { throw "cannot construct a b2WeldJoint, no constructor in IDL" }
b2WeldJoint.prototype = Object.create(b2Joint.prototype);
b2WeldJoint.prototype.constructor = b2WeldJoint;
b2WeldJoint.prototype.__class__ = b2WeldJoint;
b2WeldJoint.__cache__ = {};
Module['b2WeldJoint'] = b2WeldJoint;

b2WeldJoint.prototype['GetLocalAnchorA'] = b2WeldJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2WeldJoint.prototype['GetLocalAnchorB'] = b2WeldJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2WeldJoint.prototype['SetFrequency'] = b2WeldJoint.prototype.SetFrequency = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJoint_SetFrequency_1(self, arg0);
};;

b2WeldJoint.prototype['GetFrequency'] = b2WeldJoint.prototype.GetFrequency = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJoint_GetFrequency_0(self);
};;

b2WeldJoint.prototype['SetDampingRatio'] = b2WeldJoint.prototype.SetDampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJoint_SetDampingRatio_1(self, arg0);
};;

b2WeldJoint.prototype['GetDampingRatio'] = b2WeldJoint.prototype.GetDampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJoint_GetDampingRatio_0(self);
};;

b2WeldJoint.prototype['Dump'] = b2WeldJoint.prototype.Dump = function() {
  var self = this.ptr;
  _emscripten_bind_b2WeldJoint_Dump_0(self);
};;

b2WeldJoint.prototype['GetType'] = b2WeldJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJoint_GetType_0(self);
};;

b2WeldJoint.prototype['GetBodyA'] = b2WeldJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetBodyA_0(self), b2Body);
};;

b2WeldJoint.prototype['GetBodyB'] = b2WeldJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetBodyB_0(self), b2Body);
};;

b2WeldJoint.prototype['GetAnchorA'] = b2WeldJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetAnchorA_0(self), b2Vec2);
};;

b2WeldJoint.prototype['GetAnchorB'] = b2WeldJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetAnchorB_0(self), b2Vec2);
};;

b2WeldJoint.prototype['GetReactionForce'] = b2WeldJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2WeldJoint.prototype['GetReactionTorque'] = b2WeldJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2WeldJoint_GetReactionTorque_1(self, arg0);
};;

b2WeldJoint.prototype['GetNext'] = b2WeldJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetNext_0(self), b2Joint);
};;

b2WeldJoint.prototype['GetUserData'] = b2WeldJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJoint_GetUserData_0(self);
};;

b2WeldJoint.prototype['SetUserData'] = b2WeldJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJoint_SetUserData_1(self, arg0);
};;

b2WeldJoint.prototype['IsActive'] = b2WeldJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WeldJoint_IsActive_0(self));
};;

b2WeldJoint.prototype['GetCollideConnected'] = b2WeldJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WeldJoint_GetCollideConnected_0(self));
};;

  b2WeldJoint.prototype['__destroy__'] = b2WeldJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2WeldJoint___destroy___0(self);
};
// b2JointEdge
function b2JointEdge() {
  this.ptr = _emscripten_bind_b2JointEdge_b2JointEdge_0();
  getCache(b2JointEdge)[this.ptr] = this;
};;
b2JointEdge.prototype = Object.create(WrapperObject.prototype);
b2JointEdge.prototype.constructor = b2JointEdge;
b2JointEdge.prototype.__class__ = b2JointEdge;
b2JointEdge.__cache__ = {};
Module['b2JointEdge'] = b2JointEdge;

  b2JointEdge.prototype['get_other'] = b2JointEdge.prototype.get_other = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointEdge_get_other_0(self), b2Body);
};
    b2JointEdge.prototype['set_other'] = b2JointEdge.prototype.set_other = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointEdge_set_other_1(self, arg0);
};
  b2JointEdge.prototype['get_joint'] = b2JointEdge.prototype.get_joint = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointEdge_get_joint_0(self), b2Joint);
};
    b2JointEdge.prototype['set_joint'] = b2JointEdge.prototype.set_joint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointEdge_set_joint_1(self, arg0);
};
  b2JointEdge.prototype['get_prev'] = b2JointEdge.prototype.get_prev = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointEdge_get_prev_0(self), b2JointEdge);
};
    b2JointEdge.prototype['set_prev'] = b2JointEdge.prototype.set_prev = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointEdge_set_prev_1(self, arg0);
};
  b2JointEdge.prototype['get_next'] = b2JointEdge.prototype.get_next = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointEdge_get_next_0(self), b2JointEdge);
};
    b2JointEdge.prototype['set_next'] = b2JointEdge.prototype.set_next = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointEdge_set_next_1(self, arg0);
};
  b2JointEdge.prototype['__destroy__'] = b2JointEdge.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2JointEdge___destroy___0(self);
};
// b2PulleyJointDef
function b2PulleyJointDef() {
  this.ptr = _emscripten_bind_b2PulleyJointDef_b2PulleyJointDef_0();
  getCache(b2PulleyJointDef)[this.ptr] = this;
};;
b2PulleyJointDef.prototype = Object.create(b2JointDef.prototype);
b2PulleyJointDef.prototype.constructor = b2PulleyJointDef;
b2PulleyJointDef.prototype.__class__ = b2PulleyJointDef;
b2PulleyJointDef.__cache__ = {};
Module['b2PulleyJointDef'] = b2PulleyJointDef;

b2PulleyJointDef.prototype['Initialize'] = b2PulleyJointDef.prototype.Initialize = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  if (arg4 && typeof arg4 === 'object') arg4 = arg4.ptr;
  if (arg5 && typeof arg5 === 'object') arg5 = arg5.ptr;
  if (arg6 && typeof arg6 === 'object') arg6 = arg6.ptr;
  _emscripten_bind_b2PulleyJointDef_Initialize_7(self, arg0, arg1, arg2, arg3, arg4, arg5, arg6);
};;

  b2PulleyJointDef.prototype['get_groundAnchorA'] = b2PulleyJointDef.prototype.get_groundAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_groundAnchorA_0(self), b2Vec2);
};
    b2PulleyJointDef.prototype['set_groundAnchorA'] = b2PulleyJointDef.prototype.set_groundAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_groundAnchorA_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_groundAnchorB'] = b2PulleyJointDef.prototype.get_groundAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_groundAnchorB_0(self), b2Vec2);
};
    b2PulleyJointDef.prototype['set_groundAnchorB'] = b2PulleyJointDef.prototype.set_groundAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_groundAnchorB_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_localAnchorA'] = b2PulleyJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2PulleyJointDef.prototype['set_localAnchorA'] = b2PulleyJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_localAnchorA_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_localAnchorB'] = b2PulleyJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2PulleyJointDef.prototype['set_localAnchorB'] = b2PulleyJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_localAnchorB_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_lengthA'] = b2PulleyJointDef.prototype.get_lengthA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJointDef_get_lengthA_0(self);
};
    b2PulleyJointDef.prototype['set_lengthA'] = b2PulleyJointDef.prototype.set_lengthA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_lengthA_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_lengthB'] = b2PulleyJointDef.prototype.get_lengthB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJointDef_get_lengthB_0(self);
};
    b2PulleyJointDef.prototype['set_lengthB'] = b2PulleyJointDef.prototype.set_lengthB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_lengthB_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_ratio'] = b2PulleyJointDef.prototype.get_ratio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJointDef_get_ratio_0(self);
};
    b2PulleyJointDef.prototype['set_ratio'] = b2PulleyJointDef.prototype.set_ratio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_ratio_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_type'] = b2PulleyJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJointDef_get_type_0(self);
};
    b2PulleyJointDef.prototype['set_type'] = b2PulleyJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_type_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_userData'] = b2PulleyJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJointDef_get_userData_0(self);
};
    b2PulleyJointDef.prototype['set_userData'] = b2PulleyJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_userData_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_bodyA'] = b2PulleyJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_bodyA_0(self), b2Body);
};
    b2PulleyJointDef.prototype['set_bodyA'] = b2PulleyJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_bodyA_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_bodyB'] = b2PulleyJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_bodyB_0(self), b2Body);
};
    b2PulleyJointDef.prototype['set_bodyB'] = b2PulleyJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_bodyB_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_collideConnected'] = b2PulleyJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PulleyJointDef_get_collideConnected_0(self));
};
    b2PulleyJointDef.prototype['set_collideConnected'] = b2PulleyJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_collideConnected_1(self, arg0);
};
  b2PulleyJointDef.prototype['__destroy__'] = b2PulleyJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2PulleyJointDef___destroy___0(self);
};
// b2ManifoldPoint
function b2ManifoldPoint() {
  this.ptr = _emscripten_bind_b2ManifoldPoint_b2ManifoldPoint_0();
  getCache(b2ManifoldPoint)[this.ptr] = this;
};;
b2ManifoldPoint.prototype = Object.create(WrapperObject.prototype);
b2ManifoldPoint.prototype.constructor = b2ManifoldPoint;
b2ManifoldPoint.prototype.__class__ = b2ManifoldPoint;
b2ManifoldPoint.__cache__ = {};
Module['b2ManifoldPoint'] = b2ManifoldPoint;

  b2ManifoldPoint.prototype['get_localPoint'] = b2ManifoldPoint.prototype.get_localPoint = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ManifoldPoint_get_localPoint_0(self), b2Vec2);
};
    b2ManifoldPoint.prototype['set_localPoint'] = b2ManifoldPoint.prototype.set_localPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ManifoldPoint_set_localPoint_1(self, arg0);
};
  b2ManifoldPoint.prototype['get_normalImpulse'] = b2ManifoldPoint.prototype.get_normalImpulse = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ManifoldPoint_get_normalImpulse_0(self);
};
    b2ManifoldPoint.prototype['set_normalImpulse'] = b2ManifoldPoint.prototype.set_normalImpulse = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ManifoldPoint_set_normalImpulse_1(self, arg0);
};
  b2ManifoldPoint.prototype['get_tangentImpulse'] = b2ManifoldPoint.prototype.get_tangentImpulse = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ManifoldPoint_get_tangentImpulse_0(self);
};
    b2ManifoldPoint.prototype['set_tangentImpulse'] = b2ManifoldPoint.prototype.set_tangentImpulse = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ManifoldPoint_set_tangentImpulse_1(self, arg0);
};
  b2ManifoldPoint.prototype['get_id'] = b2ManifoldPoint.prototype.get_id = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ManifoldPoint_get_id_0(self), b2ContactID);
};
    b2ManifoldPoint.prototype['set_id'] = b2ManifoldPoint.prototype.set_id = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ManifoldPoint_set_id_1(self, arg0);
};
  b2ManifoldPoint.prototype['__destroy__'] = b2ManifoldPoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ManifoldPoint___destroy___0(self);
};
// b2Transform
function b2Transform(arg0, arg1) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Transform_b2Transform_0(); getCache(b2Transform)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Transform_b2Transform_1(arg0); getCache(b2Transform)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Transform_b2Transform_2(arg0, arg1);
  getCache(b2Transform)[this.ptr] = this;
};;
b2Transform.prototype = Object.create(WrapperObject.prototype);
b2Transform.prototype.constructor = b2Transform;
b2Transform.prototype.__class__ = b2Transform;
b2Transform.__cache__ = {};
Module['b2Transform'] = b2Transform;

b2Transform.prototype['SetIdentity'] = b2Transform.prototype.SetIdentity = function() {
  var self = this.ptr;
  _emscripten_bind_b2Transform_SetIdentity_0(self);
};;

b2Transform.prototype['Set'] = b2Transform.prototype.Set = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Transform_Set_2(self, arg0, arg1);
};;

  b2Transform.prototype['get_p'] = b2Transform.prototype.get_p = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Transform_get_p_0(self), b2Vec2);
};
    b2Transform.prototype['set_p'] = b2Transform.prototype.set_p = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Transform_set_p_1(self, arg0);
};
  b2Transform.prototype['get_q'] = b2Transform.prototype.get_q = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Transform_get_q_0(self), b2Rot);
};
    b2Transform.prototype['set_q'] = b2Transform.prototype.set_q = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Transform_set_q_1(self, arg0);
};
  b2Transform.prototype['__destroy__'] = b2Transform.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Transform___destroy___0(self);
};
// b2ChainShape
function b2ChainShape() {
  this.ptr = _emscripten_bind_b2ChainShape_b2ChainShape_0();
  getCache(b2ChainShape)[this.ptr] = this;
};;
b2ChainShape.prototype = Object.create(b2Shape.prototype);
b2ChainShape.prototype.constructor = b2ChainShape;
b2ChainShape.prototype.__class__ = b2ChainShape;
b2ChainShape.__cache__ = {};
Module['b2ChainShape'] = b2ChainShape;

b2ChainShape.prototype['Clear'] = b2ChainShape.prototype.Clear = function() {
  var self = this.ptr;
  _emscripten_bind_b2ChainShape_Clear_0(self);
};;

b2ChainShape.prototype['CreateLoop'] = b2ChainShape.prototype.CreateLoop = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2ChainShape_CreateLoop_2(self, arg0, arg1);
};;

b2ChainShape.prototype['CreateChain'] = b2ChainShape.prototype.CreateChain = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2ChainShape_CreateChain_2(self, arg0, arg1);
};;

b2ChainShape.prototype['SetPrevVertex'] = b2ChainShape.prototype.SetPrevVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_SetPrevVertex_1(self, arg0);
};;

b2ChainShape.prototype['SetNextVertex'] = b2ChainShape.prototype.SetNextVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_SetNextVertex_1(self, arg0);
};;

b2ChainShape.prototype['GetChildEdge'] = b2ChainShape.prototype.GetChildEdge = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2ChainShape_GetChildEdge_2(self, arg0, arg1);
};;

b2ChainShape.prototype['GetType'] = b2ChainShape.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ChainShape_GetType_0(self);
};;

b2ChainShape.prototype['GetChildCount'] = b2ChainShape.prototype.GetChildCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ChainShape_GetChildCount_0(self);
};;

b2ChainShape.prototype['TestPoint'] = b2ChainShape.prototype.TestPoint = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2ChainShape_TestPoint_2(self, arg0, arg1));
};;

b2ChainShape.prototype['RayCast'] = b2ChainShape.prototype.RayCast = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return !!(_emscripten_bind_b2ChainShape_RayCast_4(self, arg0, arg1, arg2, arg3));
};;

b2ChainShape.prototype['ComputeAABB'] = b2ChainShape.prototype.ComputeAABB = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2ChainShape_ComputeAABB_3(self, arg0, arg1, arg2);
};;

b2ChainShape.prototype['ComputeMass'] = b2ChainShape.prototype.ComputeMass = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2ChainShape_ComputeMass_2(self, arg0, arg1);
};;

  b2ChainShape.prototype['get_m_vertices'] = b2ChainShape.prototype.get_m_vertices = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ChainShape_get_m_vertices_0(self), b2Vec2);
};
    b2ChainShape.prototype['set_m_vertices'] = b2ChainShape.prototype.set_m_vertices = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_vertices_1(self, arg0);
};
  b2ChainShape.prototype['get_m_count'] = b2ChainShape.prototype.get_m_count = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ChainShape_get_m_count_0(self);
};
    b2ChainShape.prototype['set_m_count'] = b2ChainShape.prototype.set_m_count = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_count_1(self, arg0);
};
  b2ChainShape.prototype['get_m_prevVertex'] = b2ChainShape.prototype.get_m_prevVertex = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ChainShape_get_m_prevVertex_0(self), b2Vec2);
};
    b2ChainShape.prototype['set_m_prevVertex'] = b2ChainShape.prototype.set_m_prevVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_prevVertex_1(self, arg0);
};
  b2ChainShape.prototype['get_m_nextVertex'] = b2ChainShape.prototype.get_m_nextVertex = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ChainShape_get_m_nextVertex_0(self), b2Vec2);
};
    b2ChainShape.prototype['set_m_nextVertex'] = b2ChainShape.prototype.set_m_nextVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_nextVertex_1(self, arg0);
};
  b2ChainShape.prototype['get_m_hasPrevVertex'] = b2ChainShape.prototype.get_m_hasPrevVertex = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2ChainShape_get_m_hasPrevVertex_0(self));
};
    b2ChainShape.prototype['set_m_hasPrevVertex'] = b2ChainShape.prototype.set_m_hasPrevVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_hasPrevVertex_1(self, arg0);
};
  b2ChainShape.prototype['get_m_hasNextVertex'] = b2ChainShape.prototype.get_m_hasNextVertex = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2ChainShape_get_m_hasNextVertex_0(self));
};
    b2ChainShape.prototype['set_m_hasNextVertex'] = b2ChainShape.prototype.set_m_hasNextVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_hasNextVertex_1(self, arg0);
};
  b2ChainShape.prototype['get_m_type'] = b2ChainShape.prototype.get_m_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ChainShape_get_m_type_0(self);
};
    b2ChainShape.prototype['set_m_type'] = b2ChainShape.prototype.set_m_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_type_1(self, arg0);
};
  b2ChainShape.prototype['get_m_radius'] = b2ChainShape.prototype.get_m_radius = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ChainShape_get_m_radius_0(self);
};
    b2ChainShape.prototype['set_m_radius'] = b2ChainShape.prototype.set_m_radius = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_radius_1(self, arg0);
};
  b2ChainShape.prototype['__destroy__'] = b2ChainShape.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ChainShape___destroy___0(self);
};
// b2Color
function b2Color(arg0, arg1, arg2) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Color_b2Color_0(); getCache(b2Color)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Color_b2Color_1(arg0); getCache(b2Color)[this.ptr] = this;return }
  if (arg2 === undefined) { this.ptr = _emscripten_bind_b2Color_b2Color_2(arg0, arg1); getCache(b2Color)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Color_b2Color_3(arg0, arg1, arg2);
  getCache(b2Color)[this.ptr] = this;
};;
b2Color.prototype = Object.create(WrapperObject.prototype);
b2Color.prototype.constructor = b2Color;
b2Color.prototype.__class__ = b2Color;
b2Color.__cache__ = {};
Module['b2Color'] = b2Color;

b2Color.prototype['Set'] = b2Color.prototype.Set = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2Color_Set_3(self, arg0, arg1, arg2);
};;

  b2Color.prototype['get_r'] = b2Color.prototype.get_r = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Color_get_r_0(self);
};
    b2Color.prototype['set_r'] = b2Color.prototype.set_r = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Color_set_r_1(self, arg0);
};
  b2Color.prototype['get_g'] = b2Color.prototype.get_g = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Color_get_g_0(self);
};
    b2Color.prototype['set_g'] = b2Color.prototype.set_g = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Color_set_g_1(self, arg0);
};
  b2Color.prototype['get_b'] = b2Color.prototype.get_b = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Color_get_b_0(self);
};
    b2Color.prototype['set_b'] = b2Color.prototype.set_b = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Color_set_b_1(self, arg0);
};
  b2Color.prototype['__destroy__'] = b2Color.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Color___destroy___0(self);
};
// b2RopeJoint
function b2RopeJoint() { throw "cannot construct a b2RopeJoint, no constructor in IDL" }
b2RopeJoint.prototype = Object.create(b2Joint.prototype);
b2RopeJoint.prototype.constructor = b2RopeJoint;
b2RopeJoint.prototype.__class__ = b2RopeJoint;
b2RopeJoint.__cache__ = {};
Module['b2RopeJoint'] = b2RopeJoint;

b2RopeJoint.prototype['GetLocalAnchorA'] = b2RopeJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2RopeJoint.prototype['GetLocalAnchorB'] = b2RopeJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2RopeJoint.prototype['SetMaxLength'] = b2RopeJoint.prototype.SetMaxLength = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJoint_SetMaxLength_1(self, arg0);
};;

b2RopeJoint.prototype['GetMaxLength'] = b2RopeJoint.prototype.GetMaxLength = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJoint_GetMaxLength_0(self);
};;

b2RopeJoint.prototype['GetLimitState'] = b2RopeJoint.prototype.GetLimitState = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJoint_GetLimitState_0(self);
};;

b2RopeJoint.prototype['GetType'] = b2RopeJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJoint_GetType_0(self);
};;

b2RopeJoint.prototype['GetBodyA'] = b2RopeJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetBodyA_0(self), b2Body);
};;

b2RopeJoint.prototype['GetBodyB'] = b2RopeJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetBodyB_0(self), b2Body);
};;

b2RopeJoint.prototype['GetAnchorA'] = b2RopeJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetAnchorA_0(self), b2Vec2);
};;

b2RopeJoint.prototype['GetAnchorB'] = b2RopeJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetAnchorB_0(self), b2Vec2);
};;

b2RopeJoint.prototype['GetReactionForce'] = b2RopeJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2RopeJoint.prototype['GetReactionTorque'] = b2RopeJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2RopeJoint_GetReactionTorque_1(self, arg0);
};;

b2RopeJoint.prototype['GetNext'] = b2RopeJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetNext_0(self), b2Joint);
};;

b2RopeJoint.prototype['GetUserData'] = b2RopeJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJoint_GetUserData_0(self);
};;

b2RopeJoint.prototype['SetUserData'] = b2RopeJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJoint_SetUserData_1(self, arg0);
};;

b2RopeJoint.prototype['IsActive'] = b2RopeJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RopeJoint_IsActive_0(self));
};;

b2RopeJoint.prototype['GetCollideConnected'] = b2RopeJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RopeJoint_GetCollideConnected_0(self));
};;

  b2RopeJoint.prototype['__destroy__'] = b2RopeJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RopeJoint___destroy___0(self);
};
// b2RayCastInput
function b2RayCastInput() { throw "cannot construct a b2RayCastInput, no constructor in IDL" }
b2RayCastInput.prototype = Object.create(WrapperObject.prototype);
b2RayCastInput.prototype.constructor = b2RayCastInput;
b2RayCastInput.prototype.__class__ = b2RayCastInput;
b2RayCastInput.__cache__ = {};
Module['b2RayCastInput'] = b2RayCastInput;

  b2RayCastInput.prototype['get_p1'] = b2RayCastInput.prototype.get_p1 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RayCastInput_get_p1_0(self), b2Vec2);
};
    b2RayCastInput.prototype['set_p1'] = b2RayCastInput.prototype.set_p1 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RayCastInput_set_p1_1(self, arg0);
};
  b2RayCastInput.prototype['get_p2'] = b2RayCastInput.prototype.get_p2 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RayCastInput_get_p2_0(self), b2Vec2);
};
    b2RayCastInput.prototype['set_p2'] = b2RayCastInput.prototype.set_p2 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RayCastInput_set_p2_1(self, arg0);
};
  b2RayCastInput.prototype['get_maxFraction'] = b2RayCastInput.prototype.get_maxFraction = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RayCastInput_get_maxFraction_0(self);
};
    b2RayCastInput.prototype['set_maxFraction'] = b2RayCastInput.prototype.set_maxFraction = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RayCastInput_set_maxFraction_1(self, arg0);
};
  b2RayCastInput.prototype['__destroy__'] = b2RayCastInput.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RayCastInput___destroy___0(self);
};
// b2PolygonShape
function b2PolygonShape() {
  this.ptr = _emscripten_bind_b2PolygonShape_b2PolygonShape_0();
  getCache(b2PolygonShape)[this.ptr] = this;
};;
b2PolygonShape.prototype = Object.create(b2Shape.prototype);
b2PolygonShape.prototype.constructor = b2PolygonShape;
b2PolygonShape.prototype.__class__ = b2PolygonShape;
b2PolygonShape.__cache__ = {};
Module['b2PolygonShape'] = b2PolygonShape;

b2PolygonShape.prototype['Set'] = b2PolygonShape.prototype.Set = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2PolygonShape_Set_2(self, arg0, arg1);
};;

b2PolygonShape.prototype['SetAsBox'] = b2PolygonShape.prototype.SetAsBox = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  if (arg2 === undefined) { _emscripten_bind_b2PolygonShape_SetAsBox_2(self, arg0, arg1);  return }
  if (arg3 === undefined) { _emscripten_bind_b2PolygonShape_SetAsBox_3(self, arg0, arg1, arg2);  return }
  _emscripten_bind_b2PolygonShape_SetAsBox_4(self, arg0, arg1, arg2, arg3);
};;

b2PolygonShape.prototype['GetVertexCount'] = b2PolygonShape.prototype.GetVertexCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_GetVertexCount_0(self);
};;

b2PolygonShape.prototype['GetVertex'] = b2PolygonShape.prototype.GetVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2PolygonShape_GetVertex_1(self, arg0), b2Vec2);
};;

b2PolygonShape.prototype['GetType'] = b2PolygonShape.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_GetType_0(self);
};;

b2PolygonShape.prototype['GetChildCount'] = b2PolygonShape.prototype.GetChildCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_GetChildCount_0(self);
};;

b2PolygonShape.prototype['TestPoint'] = b2PolygonShape.prototype.TestPoint = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2PolygonShape_TestPoint_2(self, arg0, arg1));
};;

b2PolygonShape.prototype['RayCast'] = b2PolygonShape.prototype.RayCast = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return !!(_emscripten_bind_b2PolygonShape_RayCast_4(self, arg0, arg1, arg2, arg3));
};;

b2PolygonShape.prototype['ComputeAABB'] = b2PolygonShape.prototype.ComputeAABB = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2PolygonShape_ComputeAABB_3(self, arg0, arg1, arg2);
};;

b2PolygonShape.prototype['ComputeMass'] = b2PolygonShape.prototype.ComputeMass = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2PolygonShape_ComputeMass_2(self, arg0, arg1);
};;

  b2PolygonShape.prototype['get_m_centroid'] = b2PolygonShape.prototype.get_m_centroid = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PolygonShape_get_m_centroid_0(self), b2Vec2);
};
    b2PolygonShape.prototype['set_m_centroid'] = b2PolygonShape.prototype.set_m_centroid = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PolygonShape_set_m_centroid_1(self, arg0);
};
  b2PolygonShape.prototype['get_m_count'] = b2PolygonShape.prototype.get_m_count = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_get_m_count_0(self);
};
    b2PolygonShape.prototype['set_m_count'] = b2PolygonShape.prototype.set_m_count = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PolygonShape_set_m_count_1(self, arg0);
};
  b2PolygonShape.prototype['get_m_type'] = b2PolygonShape.prototype.get_m_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_get_m_type_0(self);
};
    b2PolygonShape.prototype['set_m_type'] = b2PolygonShape.prototype.set_m_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PolygonShape_set_m_type_1(self, arg0);
};
  b2PolygonShape.prototype['get_m_radius'] = b2PolygonShape.prototype.get_m_radius = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_get_m_radius_0(self);
};
    b2PolygonShape.prototype['set_m_radius'] = b2PolygonShape.prototype.set_m_radius = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PolygonShape_set_m_radius_1(self, arg0);
};
  b2PolygonShape.prototype['__destroy__'] = b2PolygonShape.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2PolygonShape___destroy___0(self);
};
// b2EdgeShape
function b2EdgeShape() {
  this.ptr = _emscripten_bind_b2EdgeShape_b2EdgeShape_0();
  getCache(b2EdgeShape)[this.ptr] = this;
};;
b2EdgeShape.prototype = Object.create(b2Shape.prototype);
b2EdgeShape.prototype.constructor = b2EdgeShape;
b2EdgeShape.prototype.__class__ = b2EdgeShape;
b2EdgeShape.__cache__ = {};
Module['b2EdgeShape'] = b2EdgeShape;

b2EdgeShape.prototype['Set'] = b2EdgeShape.prototype.Set = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2EdgeShape_Set_2(self, arg0, arg1);
};;

b2EdgeShape.prototype['GetType'] = b2EdgeShape.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2EdgeShape_GetType_0(self);
};;

b2EdgeShape.prototype['GetChildCount'] = b2EdgeShape.prototype.GetChildCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2EdgeShape_GetChildCount_0(self);
};;

b2EdgeShape.prototype['TestPoint'] = b2EdgeShape.prototype.TestPoint = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2EdgeShape_TestPoint_2(self, arg0, arg1));
};;

b2EdgeShape.prototype['RayCast'] = b2EdgeShape.prototype.RayCast = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return !!(_emscripten_bind_b2EdgeShape_RayCast_4(self, arg0, arg1, arg2, arg3));
};;

b2EdgeShape.prototype['ComputeAABB'] = b2EdgeShape.prototype.ComputeAABB = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2EdgeShape_ComputeAABB_3(self, arg0, arg1, arg2);
};;

b2EdgeShape.prototype['ComputeMass'] = b2EdgeShape.prototype.ComputeMass = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2EdgeShape_ComputeMass_2(self, arg0, arg1);
};;

  b2EdgeShape.prototype['get_m_vertex1'] = b2EdgeShape.prototype.get_m_vertex1 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2EdgeShape_get_m_vertex1_0(self), b2Vec2);
};
    b2EdgeShape.prototype['set_m_vertex1'] = b2EdgeShape.prototype.set_m_vertex1 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_vertex1_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_vertex2'] = b2EdgeShape.prototype.get_m_vertex2 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2EdgeShape_get_m_vertex2_0(self), b2Vec2);
};
    b2EdgeShape.prototype['set_m_vertex2'] = b2EdgeShape.prototype.set_m_vertex2 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_vertex2_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_vertex0'] = b2EdgeShape.prototype.get_m_vertex0 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2EdgeShape_get_m_vertex0_0(self), b2Vec2);
};
    b2EdgeShape.prototype['set_m_vertex0'] = b2EdgeShape.prototype.set_m_vertex0 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_vertex0_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_vertex3'] = b2EdgeShape.prototype.get_m_vertex3 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2EdgeShape_get_m_vertex3_0(self), b2Vec2);
};
    b2EdgeShape.prototype['set_m_vertex3'] = b2EdgeShape.prototype.set_m_vertex3 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_vertex3_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_hasVertex0'] = b2EdgeShape.prototype.get_m_hasVertex0 = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2EdgeShape_get_m_hasVertex0_0(self));
};
    b2EdgeShape.prototype['set_m_hasVertex0'] = b2EdgeShape.prototype.set_m_hasVertex0 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_hasVertex0_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_hasVertex3'] = b2EdgeShape.prototype.get_m_hasVertex3 = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2EdgeShape_get_m_hasVertex3_0(self));
};
    b2EdgeShape.prototype['set_m_hasVertex3'] = b2EdgeShape.prototype.set_m_hasVertex3 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_hasVertex3_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_type'] = b2EdgeShape.prototype.get_m_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2EdgeShape_get_m_type_0(self);
};
    b2EdgeShape.prototype['set_m_type'] = b2EdgeShape.prototype.set_m_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_type_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_radius'] = b2EdgeShape.prototype.get_m_radius = function() {
  var self = this.ptr;
  return _emscripten_bind_b2EdgeShape_get_m_radius_0(self);
};
    b2EdgeShape.prototype['set_m_radius'] = b2EdgeShape.prototype.set_m_radius = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_radius_1(self, arg0);
};
  b2EdgeShape.prototype['__destroy__'] = b2EdgeShape.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2EdgeShape___destroy___0(self);
};
// JSContactFilter
function JSContactFilter() {
  this.ptr = _emscripten_bind_JSContactFilter_JSContactFilter_0();
  getCache(JSContactFilter)[this.ptr] = this;
};;
JSContactFilter.prototype = Object.create(b2ContactFilter.prototype);
JSContactFilter.prototype.constructor = JSContactFilter;
JSContactFilter.prototype.__class__ = JSContactFilter;
JSContactFilter.__cache__ = {};
Module['JSContactFilter'] = JSContactFilter;

JSContactFilter.prototype['ShouldCollide'] = JSContactFilter.prototype.ShouldCollide = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_JSContactFilter_ShouldCollide_2(self, arg0, arg1));
};;

  JSContactFilter.prototype['__destroy__'] = JSContactFilter.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSContactFilter___destroy___0(self);
};
// b2RevoluteJointDef
function b2RevoluteJointDef() {
  this.ptr = _emscripten_bind_b2RevoluteJointDef_b2RevoluteJointDef_0();
  getCache(b2RevoluteJointDef)[this.ptr] = this;
};;
b2RevoluteJointDef.prototype = Object.create(b2JointDef.prototype);
b2RevoluteJointDef.prototype.constructor = b2RevoluteJointDef;
b2RevoluteJointDef.prototype.__class__ = b2RevoluteJointDef;
b2RevoluteJointDef.__cache__ = {};
Module['b2RevoluteJointDef'] = b2RevoluteJointDef;

b2RevoluteJointDef.prototype['Initialize'] = b2RevoluteJointDef.prototype.Initialize = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2RevoluteJointDef_Initialize_3(self, arg0, arg1, arg2);
};;

  b2RevoluteJointDef.prototype['get_localAnchorA'] = b2RevoluteJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2RevoluteJointDef.prototype['set_localAnchorA'] = b2RevoluteJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_localAnchorA_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_localAnchorB'] = b2RevoluteJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2RevoluteJointDef.prototype['set_localAnchorB'] = b2RevoluteJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_localAnchorB_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_referenceAngle'] = b2RevoluteJointDef.prototype.get_referenceAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_referenceAngle_0(self);
};
    b2RevoluteJointDef.prototype['set_referenceAngle'] = b2RevoluteJointDef.prototype.set_referenceAngle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_referenceAngle_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_enableLimit'] = b2RevoluteJointDef.prototype.get_enableLimit = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJointDef_get_enableLimit_0(self));
};
    b2RevoluteJointDef.prototype['set_enableLimit'] = b2RevoluteJointDef.prototype.set_enableLimit = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_enableLimit_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_lowerAngle'] = b2RevoluteJointDef.prototype.get_lowerAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_lowerAngle_0(self);
};
    b2RevoluteJointDef.prototype['set_lowerAngle'] = b2RevoluteJointDef.prototype.set_lowerAngle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_lowerAngle_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_upperAngle'] = b2RevoluteJointDef.prototype.get_upperAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_upperAngle_0(self);
};
    b2RevoluteJointDef.prototype['set_upperAngle'] = b2RevoluteJointDef.prototype.set_upperAngle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_upperAngle_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_enableMotor'] = b2RevoluteJointDef.prototype.get_enableMotor = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJointDef_get_enableMotor_0(self));
};
    b2RevoluteJointDef.prototype['set_enableMotor'] = b2RevoluteJointDef.prototype.set_enableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_enableMotor_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_motorSpeed'] = b2RevoluteJointDef.prototype.get_motorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_motorSpeed_0(self);
};
    b2RevoluteJointDef.prototype['set_motorSpeed'] = b2RevoluteJointDef.prototype.set_motorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_motorSpeed_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_maxMotorTorque'] = b2RevoluteJointDef.prototype.get_maxMotorTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_maxMotorTorque_0(self);
};
    b2RevoluteJointDef.prototype['set_maxMotorTorque'] = b2RevoluteJointDef.prototype.set_maxMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_maxMotorTorque_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_type'] = b2RevoluteJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_type_0(self);
};
    b2RevoluteJointDef.prototype['set_type'] = b2RevoluteJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_type_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_userData'] = b2RevoluteJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_userData_0(self);
};
    b2RevoluteJointDef.prototype['set_userData'] = b2RevoluteJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_userData_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_bodyA'] = b2RevoluteJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJointDef_get_bodyA_0(self), b2Body);
};
    b2RevoluteJointDef.prototype['set_bodyA'] = b2RevoluteJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_bodyA_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_bodyB'] = b2RevoluteJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJointDef_get_bodyB_0(self), b2Body);
};
    b2RevoluteJointDef.prototype['set_bodyB'] = b2RevoluteJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_bodyB_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_collideConnected'] = b2RevoluteJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJointDef_get_collideConnected_0(self));
};
    b2RevoluteJointDef.prototype['set_collideConnected'] = b2RevoluteJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_collideConnected_1(self, arg0);
};
  b2RevoluteJointDef.prototype['__destroy__'] = b2RevoluteJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RevoluteJointDef___destroy___0(self);
};
// JSDraw
function JSDraw() {
  this.ptr = _emscripten_bind_JSDraw_JSDraw_0();
  getCache(JSDraw)[this.ptr] = this;
};;
JSDraw.prototype = Object.create(b2Draw.prototype);
JSDraw.prototype.constructor = JSDraw;
JSDraw.prototype.__class__ = JSDraw;
JSDraw.__cache__ = {};
Module['JSDraw'] = JSDraw;

JSDraw.prototype['DrawPolygon'] = JSDraw.prototype.DrawPolygon = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_JSDraw_DrawPolygon_3(self, arg0, arg1, arg2);
};;

JSDraw.prototype['DrawSolidPolygon'] = JSDraw.prototype.DrawSolidPolygon = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_JSDraw_DrawSolidPolygon_3(self, arg0, arg1, arg2);
};;

JSDraw.prototype['DrawCircle'] = JSDraw.prototype.DrawCircle = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_JSDraw_DrawCircle_3(self, arg0, arg1, arg2);
};;

JSDraw.prototype['DrawSolidCircle'] = JSDraw.prototype.DrawSolidCircle = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  _emscripten_bind_JSDraw_DrawSolidCircle_4(self, arg0, arg1, arg2, arg3);
};;

JSDraw.prototype['DrawSegment'] = JSDraw.prototype.DrawSegment = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_JSDraw_DrawSegment_3(self, arg0, arg1, arg2);
};;

JSDraw.prototype['DrawTransform'] = JSDraw.prototype.DrawTransform = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_JSDraw_DrawTransform_1(self, arg0);
};;

  JSDraw.prototype['__destroy__'] = JSDraw.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSDraw___destroy___0(self);
};
// b2WheelJoint
function b2WheelJoint() { throw "cannot construct a b2WheelJoint, no constructor in IDL" }
b2WheelJoint.prototype = Object.create(b2Joint.prototype);
b2WheelJoint.prototype.constructor = b2WheelJoint;
b2WheelJoint.prototype.__class__ = b2WheelJoint;
b2WheelJoint.__cache__ = {};
Module['b2WheelJoint'] = b2WheelJoint;

b2WheelJoint.prototype['GetLocalAnchorA'] = b2WheelJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2WheelJoint.prototype['GetLocalAnchorB'] = b2WheelJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2WheelJoint.prototype['GetLocalAxisA'] = b2WheelJoint.prototype.GetLocalAxisA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetLocalAxisA_0(self), b2Vec2);
};;

b2WheelJoint.prototype['GetJointTranslation'] = b2WheelJoint.prototype.GetJointTranslation = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetJointTranslation_0(self);
};;

b2WheelJoint.prototype['GetJointSpeed'] = b2WheelJoint.prototype.GetJointSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetJointSpeed_0(self);
};;

b2WheelJoint.prototype['IsMotorEnabled'] = b2WheelJoint.prototype.IsMotorEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WheelJoint_IsMotorEnabled_0(self));
};;

b2WheelJoint.prototype['EnableMotor'] = b2WheelJoint.prototype.EnableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_EnableMotor_1(self, arg0);
};;

b2WheelJoint.prototype['SetMotorSpeed'] = b2WheelJoint.prototype.SetMotorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_SetMotorSpeed_1(self, arg0);
};;

b2WheelJoint.prototype['GetMotorSpeed'] = b2WheelJoint.prototype.GetMotorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetMotorSpeed_0(self);
};;

b2WheelJoint.prototype['SetMaxMotorTorque'] = b2WheelJoint.prototype.SetMaxMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_SetMaxMotorTorque_1(self, arg0);
};;

b2WheelJoint.prototype['GetMaxMotorTorque'] = b2WheelJoint.prototype.GetMaxMotorTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetMaxMotorTorque_0(self);
};;

b2WheelJoint.prototype['GetMotorTorque'] = b2WheelJoint.prototype.GetMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2WheelJoint_GetMotorTorque_1(self, arg0);
};;

b2WheelJoint.prototype['SetSpringFrequencyHz'] = b2WheelJoint.prototype.SetSpringFrequencyHz = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_SetSpringFrequencyHz_1(self, arg0);
};;

b2WheelJoint.prototype['GetSpringFrequencyHz'] = b2WheelJoint.prototype.GetSpringFrequencyHz = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetSpringFrequencyHz_0(self);
};;

b2WheelJoint.prototype['SetSpringDampingRatio'] = b2WheelJoint.prototype.SetSpringDampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_SetSpringDampingRatio_1(self, arg0);
};;

b2WheelJoint.prototype['GetSpringDampingRatio'] = b2WheelJoint.prototype.GetSpringDampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetSpringDampingRatio_0(self);
};;

b2WheelJoint.prototype['GetType'] = b2WheelJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetType_0(self);
};;

b2WheelJoint.prototype['GetBodyA'] = b2WheelJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetBodyA_0(self), b2Body);
};;

b2WheelJoint.prototype['GetBodyB'] = b2WheelJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetBodyB_0(self), b2Body);
};;

b2WheelJoint.prototype['GetAnchorA'] = b2WheelJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetAnchorA_0(self), b2Vec2);
};;

b2WheelJoint.prototype['GetAnchorB'] = b2WheelJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetAnchorB_0(self), b2Vec2);
};;

b2WheelJoint.prototype['GetReactionForce'] = b2WheelJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2WheelJoint.prototype['GetReactionTorque'] = b2WheelJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2WheelJoint_GetReactionTorque_1(self, arg0);
};;

b2WheelJoint.prototype['GetNext'] = b2WheelJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetNext_0(self), b2Joint);
};;

b2WheelJoint.prototype['GetUserData'] = b2WheelJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetUserData_0(self);
};;

b2WheelJoint.prototype['SetUserData'] = b2WheelJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_SetUserData_1(self, arg0);
};;

b2WheelJoint.prototype['IsActive'] = b2WheelJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WheelJoint_IsActive_0(self));
};;

b2WheelJoint.prototype['GetCollideConnected'] = b2WheelJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WheelJoint_GetCollideConnected_0(self));
};;

  b2WheelJoint.prototype['__destroy__'] = b2WheelJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2WheelJoint___destroy___0(self);
};
// b2PulleyJoint
function b2PulleyJoint() { throw "cannot construct a b2PulleyJoint, no constructor in IDL" }
b2PulleyJoint.prototype = Object.create(b2Joint.prototype);
b2PulleyJoint.prototype.constructor = b2PulleyJoint;
b2PulleyJoint.prototype.__class__ = b2PulleyJoint;
b2PulleyJoint.__cache__ = {};
Module['b2PulleyJoint'] = b2PulleyJoint;

b2PulleyJoint.prototype['GetGroundAnchorA'] = b2PulleyJoint.prototype.GetGroundAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetGroundAnchorA_0(self), b2Vec2);
};;

b2PulleyJoint.prototype['GetGroundAnchorB'] = b2PulleyJoint.prototype.GetGroundAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetGroundAnchorB_0(self), b2Vec2);
};;

b2PulleyJoint.prototype['GetLengthA'] = b2PulleyJoint.prototype.GetLengthA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetLengthA_0(self);
};;

b2PulleyJoint.prototype['GetLengthB'] = b2PulleyJoint.prototype.GetLengthB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetLengthB_0(self);
};;

b2PulleyJoint.prototype['GetRatio'] = b2PulleyJoint.prototype.GetRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetRatio_0(self);
};;

b2PulleyJoint.prototype['GetCurrentLengthA'] = b2PulleyJoint.prototype.GetCurrentLengthA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetCurrentLengthA_0(self);
};;

b2PulleyJoint.prototype['GetCurrentLengthB'] = b2PulleyJoint.prototype.GetCurrentLengthB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetCurrentLengthB_0(self);
};;

b2PulleyJoint.prototype['GetType'] = b2PulleyJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetType_0(self);
};;

b2PulleyJoint.prototype['GetBodyA'] = b2PulleyJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetBodyA_0(self), b2Body);
};;

b2PulleyJoint.prototype['GetBodyB'] = b2PulleyJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetBodyB_0(self), b2Body);
};;

b2PulleyJoint.prototype['GetAnchorA'] = b2PulleyJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetAnchorA_0(self), b2Vec2);
};;

b2PulleyJoint.prototype['GetAnchorB'] = b2PulleyJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetAnchorB_0(self), b2Vec2);
};;

b2PulleyJoint.prototype['GetReactionForce'] = b2PulleyJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2PulleyJoint.prototype['GetReactionTorque'] = b2PulleyJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2PulleyJoint_GetReactionTorque_1(self, arg0);
};;

b2PulleyJoint.prototype['GetNext'] = b2PulleyJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetNext_0(self), b2Joint);
};;

b2PulleyJoint.prototype['GetUserData'] = b2PulleyJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetUserData_0(self);
};;

b2PulleyJoint.prototype['SetUserData'] = b2PulleyJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJoint_SetUserData_1(self, arg0);
};;

b2PulleyJoint.prototype['IsActive'] = b2PulleyJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PulleyJoint_IsActive_0(self));
};;

b2PulleyJoint.prototype['GetCollideConnected'] = b2PulleyJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PulleyJoint_GetCollideConnected_0(self));
};;

  b2PulleyJoint.prototype['__destroy__'] = b2PulleyJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2PulleyJoint___destroy___0(self);
};
// b2MouseJointDef
function b2MouseJointDef() {
  this.ptr = _emscripten_bind_b2MouseJointDef_b2MouseJointDef_0();
  getCache(b2MouseJointDef)[this.ptr] = this;
};;
b2MouseJointDef.prototype = Object.create(b2JointDef.prototype);
b2MouseJointDef.prototype.constructor = b2MouseJointDef;
b2MouseJointDef.prototype.__class__ = b2MouseJointDef;
b2MouseJointDef.__cache__ = {};
Module['b2MouseJointDef'] = b2MouseJointDef;

  b2MouseJointDef.prototype['get_target'] = b2MouseJointDef.prototype.get_target = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJointDef_get_target_0(self), b2Vec2);
};
    b2MouseJointDef.prototype['set_target'] = b2MouseJointDef.prototype.set_target = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_target_1(self, arg0);
};
  b2MouseJointDef.prototype['get_maxForce'] = b2MouseJointDef.prototype.get_maxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJointDef_get_maxForce_0(self);
};
    b2MouseJointDef.prototype['set_maxForce'] = b2MouseJointDef.prototype.set_maxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_maxForce_1(self, arg0);
};
  b2MouseJointDef.prototype['get_frequencyHz'] = b2MouseJointDef.prototype.get_frequencyHz = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJointDef_get_frequencyHz_0(self);
};
    b2MouseJointDef.prototype['set_frequencyHz'] = b2MouseJointDef.prototype.set_frequencyHz = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_frequencyHz_1(self, arg0);
};
  b2MouseJointDef.prototype['get_dampingRatio'] = b2MouseJointDef.prototype.get_dampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJointDef_get_dampingRatio_0(self);
};
    b2MouseJointDef.prototype['set_dampingRatio'] = b2MouseJointDef.prototype.set_dampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_dampingRatio_1(self, arg0);
};
  b2MouseJointDef.prototype['get_type'] = b2MouseJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJointDef_get_type_0(self);
};
    b2MouseJointDef.prototype['set_type'] = b2MouseJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_type_1(self, arg0);
};
  b2MouseJointDef.prototype['get_userData'] = b2MouseJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJointDef_get_userData_0(self);
};
    b2MouseJointDef.prototype['set_userData'] = b2MouseJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_userData_1(self, arg0);
};
  b2MouseJointDef.prototype['get_bodyA'] = b2MouseJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJointDef_get_bodyA_0(self), b2Body);
};
    b2MouseJointDef.prototype['set_bodyA'] = b2MouseJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_bodyA_1(self, arg0);
};
  b2MouseJointDef.prototype['get_bodyB'] = b2MouseJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJointDef_get_bodyB_0(self), b2Body);
};
    b2MouseJointDef.prototype['set_bodyB'] = b2MouseJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_bodyB_1(self, arg0);
};
  b2MouseJointDef.prototype['get_collideConnected'] = b2MouseJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MouseJointDef_get_collideConnected_0(self));
};
    b2MouseJointDef.prototype['set_collideConnected'] = b2MouseJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_collideConnected_1(self, arg0);
};
  b2MouseJointDef.prototype['__destroy__'] = b2MouseJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2MouseJointDef___destroy___0(self);
};
// b2Contact
function b2Contact() { throw "cannot construct a b2Contact, no constructor in IDL" }
b2Contact.prototype = Object.create(WrapperObject.prototype);
b2Contact.prototype.constructor = b2Contact;
b2Contact.prototype.__class__ = b2Contact;
b2Contact.__cache__ = {};
Module['b2Contact'] = b2Contact;

b2Contact.prototype['GetManifold'] = b2Contact.prototype.GetManifold = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Contact_GetManifold_0(self), b2Manifold);
};;

b2Contact.prototype['IsTouching'] = b2Contact.prototype.IsTouching = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Contact_IsTouching_0(self));
};;

b2Contact.prototype['SetEnabled'] = b2Contact.prototype.SetEnabled = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Contact_SetEnabled_1(self, arg0);
};;

b2Contact.prototype['IsEnabled'] = b2Contact.prototype.IsEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Contact_IsEnabled_0(self));
};;

b2Contact.prototype['GetNext'] = b2Contact.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Contact_GetNext_0(self), b2Contact);
};;

b2Contact.prototype['GetFixtureA'] = b2Contact.prototype.GetFixtureA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Contact_GetFixtureA_0(self), b2Fixture);
};;

b2Contact.prototype['GetChildIndexA'] = b2Contact.prototype.GetChildIndexA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Contact_GetChildIndexA_0(self);
};;

b2Contact.prototype['GetFixtureB'] = b2Contact.prototype.GetFixtureB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Contact_GetFixtureB_0(self), b2Fixture);
};;

b2Contact.prototype['GetChildIndexB'] = b2Contact.prototype.GetChildIndexB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Contact_GetChildIndexB_0(self);
};;

b2Contact.prototype['SetFriction'] = b2Contact.prototype.SetFriction = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Contact_SetFriction_1(self, arg0);
};;

b2Contact.prototype['GetFriction'] = b2Contact.prototype.GetFriction = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Contact_GetFriction_0(self);
};;

b2Contact.prototype['ResetFriction'] = b2Contact.prototype.ResetFriction = function() {
  var self = this.ptr;
  _emscripten_bind_b2Contact_ResetFriction_0(self);
};;

b2Contact.prototype['SetRestitution'] = b2Contact.prototype.SetRestitution = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Contact_SetRestitution_1(self, arg0);
};;

b2Contact.prototype['GetRestitution'] = b2Contact.prototype.GetRestitution = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Contact_GetRestitution_0(self);
};;

b2Contact.prototype['ResetRestitution'] = b2Contact.prototype.ResetRestitution = function() {
  var self = this.ptr;
  _emscripten_bind_b2Contact_ResetRestitution_0(self);
};;

b2Contact.prototype['SetTangentSpeed'] = b2Contact.prototype.SetTangentSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Contact_SetTangentSpeed_1(self, arg0);
};;

b2Contact.prototype['GetTangentSpeed'] = b2Contact.prototype.GetTangentSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Contact_GetTangentSpeed_0(self);
};;

// b2DistanceJointDef
function b2DistanceJointDef() {
  this.ptr = _emscripten_bind_b2DistanceJointDef_b2DistanceJointDef_0();
  getCache(b2DistanceJointDef)[this.ptr] = this;
};;
b2DistanceJointDef.prototype = Object.create(b2JointDef.prototype);
b2DistanceJointDef.prototype.constructor = b2DistanceJointDef;
b2DistanceJointDef.prototype.__class__ = b2DistanceJointDef;
b2DistanceJointDef.__cache__ = {};
Module['b2DistanceJointDef'] = b2DistanceJointDef;

b2DistanceJointDef.prototype['Initialize'] = b2DistanceJointDef.prototype.Initialize = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  _emscripten_bind_b2DistanceJointDef_Initialize_4(self, arg0, arg1, arg2, arg3);
};;

  b2DistanceJointDef.prototype['get_localAnchorA'] = b2DistanceJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2DistanceJointDef.prototype['set_localAnchorA'] = b2DistanceJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_localAnchorA_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_localAnchorB'] = b2DistanceJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2DistanceJointDef.prototype['set_localAnchorB'] = b2DistanceJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_localAnchorB_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_length'] = b2DistanceJointDef.prototype.get_length = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJointDef_get_length_0(self);
};
    b2DistanceJointDef.prototype['set_length'] = b2DistanceJointDef.prototype.set_length = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_length_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_frequencyHz'] = b2DistanceJointDef.prototype.get_frequencyHz = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJointDef_get_frequencyHz_0(self);
};
    b2DistanceJointDef.prototype['set_frequencyHz'] = b2DistanceJointDef.prototype.set_frequencyHz = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_frequencyHz_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_dampingRatio'] = b2DistanceJointDef.prototype.get_dampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJointDef_get_dampingRatio_0(self);
};
    b2DistanceJointDef.prototype['set_dampingRatio'] = b2DistanceJointDef.prototype.set_dampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_dampingRatio_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_type'] = b2DistanceJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJointDef_get_type_0(self);
};
    b2DistanceJointDef.prototype['set_type'] = b2DistanceJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_type_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_userData'] = b2DistanceJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJointDef_get_userData_0(self);
};
    b2DistanceJointDef.prototype['set_userData'] = b2DistanceJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_userData_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_bodyA'] = b2DistanceJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJointDef_get_bodyA_0(self), b2Body);
};
    b2DistanceJointDef.prototype['set_bodyA'] = b2DistanceJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_bodyA_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_bodyB'] = b2DistanceJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJointDef_get_bodyB_0(self), b2Body);
};
    b2DistanceJointDef.prototype['set_bodyB'] = b2DistanceJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_bodyB_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_collideConnected'] = b2DistanceJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2DistanceJointDef_get_collideConnected_0(self));
};
    b2DistanceJointDef.prototype['set_collideConnected'] = b2DistanceJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_collideConnected_1(self, arg0);
};
  b2DistanceJointDef.prototype['__destroy__'] = b2DistanceJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2DistanceJointDef___destroy___0(self);
};
// b2Body
function b2Body() { throw "cannot construct a b2Body, no constructor in IDL" }
b2Body.prototype = Object.create(WrapperObject.prototype);
b2Body.prototype.constructor = b2Body;
b2Body.prototype.__class__ = b2Body;
b2Body.__cache__ = {};
Module['b2Body'] = b2Body;

b2Body.prototype['CreateFixture'] = b2Body.prototype.CreateFixture = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg1 === undefined) { return wrapPointer(_emscripten_bind_b2Body_CreateFixture_1(self, arg0), b2Fixture) }
  return wrapPointer(_emscripten_bind_b2Body_CreateFixture_2(self, arg0, arg1), b2Fixture);
};;

b2Body.prototype['DestroyFixture'] = b2Body.prototype.DestroyFixture = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_DestroyFixture_1(self, arg0);
};;

b2Body.prototype['SetTransform'] = b2Body.prototype.SetTransform = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Body_SetTransform_2(self, arg0, arg1);
};;

b2Body.prototype['GetTransform'] = b2Body.prototype.GetTransform = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetTransform_0(self), b2Transform);
};;

b2Body.prototype['GetPosition'] = b2Body.prototype.GetPosition = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetPosition_0(self), b2Vec2);
};;

b2Body.prototype['GetAngle'] = b2Body.prototype.GetAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetAngle_0(self);
};;

b2Body.prototype['GetWorldCenter'] = b2Body.prototype.GetWorldCenter = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetWorldCenter_0(self), b2Vec2);
};;

b2Body.prototype['GetLocalCenter'] = b2Body.prototype.GetLocalCenter = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLocalCenter_0(self), b2Vec2);
};;

b2Body.prototype['SetLinearVelocity'] = b2Body.prototype.SetLinearVelocity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetLinearVelocity_1(self, arg0);
};;

b2Body.prototype['GetLinearVelocity'] = b2Body.prototype.GetLinearVelocity = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLinearVelocity_0(self), b2Vec2);
};;

b2Body.prototype['SetAngularVelocity'] = b2Body.prototype.SetAngularVelocity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetAngularVelocity_1(self, arg0);
};;

b2Body.prototype['GetAngularVelocity'] = b2Body.prototype.GetAngularVelocity = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetAngularVelocity_0(self);
};;

b2Body.prototype['ApplyForce'] = b2Body.prototype.ApplyForce = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2Body_ApplyForce_3(self, arg0, arg1, arg2);
};;

b2Body.prototype['ApplyForceToCenter'] = b2Body.prototype.ApplyForceToCenter = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Body_ApplyForceToCenter_2(self, arg0, arg1);
};;

b2Body.prototype['ApplyTorque'] = b2Body.prototype.ApplyTorque = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Body_ApplyTorque_2(self, arg0, arg1);
};;

b2Body.prototype['ApplyLinearImpulse'] = b2Body.prototype.ApplyLinearImpulse = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2Body_ApplyLinearImpulse_3(self, arg0, arg1, arg2);
};;

b2Body.prototype['ApplyAngularImpulse'] = b2Body.prototype.ApplyAngularImpulse = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Body_ApplyAngularImpulse_2(self, arg0, arg1);
};;

b2Body.prototype['GetMass'] = b2Body.prototype.GetMass = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetMass_0(self);
};;

b2Body.prototype['GetInertia'] = b2Body.prototype.GetInertia = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetInertia_0(self);
};;

b2Body.prototype['GetMassData'] = b2Body.prototype.GetMassData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_GetMassData_1(self, arg0);
};;

b2Body.prototype['SetMassData'] = b2Body.prototype.SetMassData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetMassData_1(self, arg0);
};;

b2Body.prototype['ResetMassData'] = b2Body.prototype.ResetMassData = function() {
  var self = this.ptr;
  _emscripten_bind_b2Body_ResetMassData_0(self);
};;

b2Body.prototype['GetWorldPoint'] = b2Body.prototype.GetWorldPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetWorldPoint_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetWorldVector'] = b2Body.prototype.GetWorldVector = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetWorldVector_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetLocalPoint'] = b2Body.prototype.GetLocalPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLocalPoint_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetLocalVector'] = b2Body.prototype.GetLocalVector = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLocalVector_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetLinearVelocityFromWorldPoint'] = b2Body.prototype.GetLinearVelocityFromWorldPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLinearVelocityFromWorldPoint_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetLinearVelocityFromLocalPoint'] = b2Body.prototype.GetLinearVelocityFromLocalPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLinearVelocityFromLocalPoint_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetLinearDamping'] = b2Body.prototype.GetLinearDamping = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetLinearDamping_0(self);
};;

b2Body.prototype['SetLinearDamping'] = b2Body.prototype.SetLinearDamping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetLinearDamping_1(self, arg0);
};;

b2Body.prototype['GetAngularDamping'] = b2Body.prototype.GetAngularDamping = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetAngularDamping_0(self);
};;

b2Body.prototype['SetAngularDamping'] = b2Body.prototype.SetAngularDamping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetAngularDamping_1(self, arg0);
};;

b2Body.prototype['GetGravityScale'] = b2Body.prototype.GetGravityScale = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetGravityScale_0(self);
};;

b2Body.prototype['SetGravityScale'] = b2Body.prototype.SetGravityScale = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetGravityScale_1(self, arg0);
};;

b2Body.prototype['SetType'] = b2Body.prototype.SetType = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetType_1(self, arg0);
};;

b2Body.prototype['GetType'] = b2Body.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetType_0(self);
};;

b2Body.prototype['SetBullet'] = b2Body.prototype.SetBullet = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetBullet_1(self, arg0);
};;

b2Body.prototype['IsBullet'] = b2Body.prototype.IsBullet = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Body_IsBullet_0(self));
};;

b2Body.prototype['SetSleepingAllowed'] = b2Body.prototype.SetSleepingAllowed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetSleepingAllowed_1(self, arg0);
};;

b2Body.prototype['IsSleepingAllowed'] = b2Body.prototype.IsSleepingAllowed = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Body_IsSleepingAllowed_0(self));
};;

b2Body.prototype['SetAwake'] = b2Body.prototype.SetAwake = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetAwake_1(self, arg0);
};;

b2Body.prototype['IsAwake'] = b2Body.prototype.IsAwake = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Body_IsAwake_0(self));
};;

b2Body.prototype['SetActive'] = b2Body.prototype.SetActive = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetActive_1(self, arg0);
};;

b2Body.prototype['IsActive'] = b2Body.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Body_IsActive_0(self));
};;

b2Body.prototype['SetFixedRotation'] = b2Body.prototype.SetFixedRotation = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetFixedRotation_1(self, arg0);
};;

b2Body.prototype['IsFixedRotation'] = b2Body.prototype.IsFixedRotation = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Body_IsFixedRotation_0(self));
};;

b2Body.prototype['GetFixtureList'] = b2Body.prototype.GetFixtureList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetFixtureList_0(self), b2Fixture);
};;

b2Body.prototype['GetJointList'] = b2Body.prototype.GetJointList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetJointList_0(self), b2JointEdge);
};;

b2Body.prototype['GetContactList'] = b2Body.prototype.GetContactList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetContactList_0(self), b2ContactEdge);
};;

b2Body.prototype['GetNext'] = b2Body.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetNext_0(self), b2Body);
};;

b2Body.prototype['GetUserData'] = b2Body.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetUserData_0(self);
};;

b2Body.prototype['SetUserData'] = b2Body.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetUserData_1(self, arg0);
};;

b2Body.prototype['GetWorld'] = b2Body.prototype.GetWorld = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetWorld_0(self), b2World);
};;

b2Body.prototype['Dump'] = b2Body.prototype.Dump = function() {
  var self = this.ptr;
  _emscripten_bind_b2Body_Dump_0(self);
};;

// b2FrictionJoint
function b2FrictionJoint() { throw "cannot construct a b2FrictionJoint, no constructor in IDL" }
b2FrictionJoint.prototype = Object.create(b2Joint.prototype);
b2FrictionJoint.prototype.constructor = b2FrictionJoint;
b2FrictionJoint.prototype.__class__ = b2FrictionJoint;
b2FrictionJoint.__cache__ = {};
Module['b2FrictionJoint'] = b2FrictionJoint;

b2FrictionJoint.prototype['GetLocalAnchorA'] = b2FrictionJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2FrictionJoint.prototype['GetLocalAnchorB'] = b2FrictionJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2FrictionJoint.prototype['SetMaxForce'] = b2FrictionJoint.prototype.SetMaxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJoint_SetMaxForce_1(self, arg0);
};;

b2FrictionJoint.prototype['GetMaxForce'] = b2FrictionJoint.prototype.GetMaxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJoint_GetMaxForce_0(self);
};;

b2FrictionJoint.prototype['SetMaxTorque'] = b2FrictionJoint.prototype.SetMaxTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJoint_SetMaxTorque_1(self, arg0);
};;

b2FrictionJoint.prototype['GetMaxTorque'] = b2FrictionJoint.prototype.GetMaxTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJoint_GetMaxTorque_0(self);
};;

b2FrictionJoint.prototype['GetType'] = b2FrictionJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJoint_GetType_0(self);
};;

b2FrictionJoint.prototype['GetBodyA'] = b2FrictionJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetBodyA_0(self), b2Body);
};;

b2FrictionJoint.prototype['GetBodyB'] = b2FrictionJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetBodyB_0(self), b2Body);
};;

b2FrictionJoint.prototype['GetAnchorA'] = b2FrictionJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetAnchorA_0(self), b2Vec2);
};;

b2FrictionJoint.prototype['GetAnchorB'] = b2FrictionJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetAnchorB_0(self), b2Vec2);
};;

b2FrictionJoint.prototype['GetReactionForce'] = b2FrictionJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2FrictionJoint.prototype['GetReactionTorque'] = b2FrictionJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2FrictionJoint_GetReactionTorque_1(self, arg0);
};;

b2FrictionJoint.prototype['GetNext'] = b2FrictionJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetNext_0(self), b2Joint);
};;

b2FrictionJoint.prototype['GetUserData'] = b2FrictionJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJoint_GetUserData_0(self);
};;

b2FrictionJoint.prototype['SetUserData'] = b2FrictionJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJoint_SetUserData_1(self, arg0);
};;

b2FrictionJoint.prototype['IsActive'] = b2FrictionJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2FrictionJoint_IsActive_0(self));
};;

b2FrictionJoint.prototype['GetCollideConnected'] = b2FrictionJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2FrictionJoint_GetCollideConnected_0(self));
};;

  b2FrictionJoint.prototype['__destroy__'] = b2FrictionJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2FrictionJoint___destroy___0(self);
};
// b2DestructionListener
function b2DestructionListener() { throw "cannot construct a b2DestructionListener, no constructor in IDL" }
b2DestructionListener.prototype = Object.create(WrapperObject.prototype);
b2DestructionListener.prototype.constructor = b2DestructionListener;
b2DestructionListener.prototype.__class__ = b2DestructionListener;
b2DestructionListener.__cache__ = {};
Module['b2DestructionListener'] = b2DestructionListener;

  b2DestructionListener.prototype['__destroy__'] = b2DestructionListener.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2DestructionListener___destroy___0(self);
};
// b2GearJointDef
function b2GearJointDef() {
  this.ptr = _emscripten_bind_b2GearJointDef_b2GearJointDef_0();
  getCache(b2GearJointDef)[this.ptr] = this;
};;
b2GearJointDef.prototype = Object.create(b2JointDef.prototype);
b2GearJointDef.prototype.constructor = b2GearJointDef;
b2GearJointDef.prototype.__class__ = b2GearJointDef;
b2GearJointDef.__cache__ = {};
Module['b2GearJointDef'] = b2GearJointDef;

  b2GearJointDef.prototype['get_joint1'] = b2GearJointDef.prototype.get_joint1 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJointDef_get_joint1_0(self), b2Joint);
};
    b2GearJointDef.prototype['set_joint1'] = b2GearJointDef.prototype.set_joint1 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_joint1_1(self, arg0);
};
  b2GearJointDef.prototype['get_joint2'] = b2GearJointDef.prototype.get_joint2 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJointDef_get_joint2_0(self), b2Joint);
};
    b2GearJointDef.prototype['set_joint2'] = b2GearJointDef.prototype.set_joint2 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_joint2_1(self, arg0);
};
  b2GearJointDef.prototype['get_ratio'] = b2GearJointDef.prototype.get_ratio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJointDef_get_ratio_0(self);
};
    b2GearJointDef.prototype['set_ratio'] = b2GearJointDef.prototype.set_ratio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_ratio_1(self, arg0);
};
  b2GearJointDef.prototype['get_type'] = b2GearJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJointDef_get_type_0(self);
};
    b2GearJointDef.prototype['set_type'] = b2GearJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_type_1(self, arg0);
};
  b2GearJointDef.prototype['get_userData'] = b2GearJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJointDef_get_userData_0(self);
};
    b2GearJointDef.prototype['set_userData'] = b2GearJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_userData_1(self, arg0);
};
  b2GearJointDef.prototype['get_bodyA'] = b2GearJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJointDef_get_bodyA_0(self), b2Body);
};
    b2GearJointDef.prototype['set_bodyA'] = b2GearJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_bodyA_1(self, arg0);
};
  b2GearJointDef.prototype['get_bodyB'] = b2GearJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJointDef_get_bodyB_0(self), b2Body);
};
    b2GearJointDef.prototype['set_bodyB'] = b2GearJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_bodyB_1(self, arg0);
};
  b2GearJointDef.prototype['get_collideConnected'] = b2GearJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2GearJointDef_get_collideConnected_0(self));
};
    b2GearJointDef.prototype['set_collideConnected'] = b2GearJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_collideConnected_1(self, arg0);
};
  b2GearJointDef.prototype['__destroy__'] = b2GearJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2GearJointDef___destroy___0(self);
};
// b2RevoluteJoint
function b2RevoluteJoint() { throw "cannot construct a b2RevoluteJoint, no constructor in IDL" }
b2RevoluteJoint.prototype = Object.create(b2Joint.prototype);
b2RevoluteJoint.prototype.constructor = b2RevoluteJoint;
b2RevoluteJoint.prototype.__class__ = b2RevoluteJoint;
b2RevoluteJoint.__cache__ = {};
Module['b2RevoluteJoint'] = b2RevoluteJoint;

b2RevoluteJoint.prototype['GetLocalAnchorA'] = b2RevoluteJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2RevoluteJoint.prototype['GetLocalAnchorB'] = b2RevoluteJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2RevoluteJoint.prototype['GetReferenceAngle'] = b2RevoluteJoint.prototype.GetReferenceAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetReferenceAngle_0(self);
};;

b2RevoluteJoint.prototype['GetJointAngle'] = b2RevoluteJoint.prototype.GetJointAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetJointAngle_0(self);
};;

b2RevoluteJoint.prototype['GetJointSpeed'] = b2RevoluteJoint.prototype.GetJointSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetJointSpeed_0(self);
};;

b2RevoluteJoint.prototype['IsLimitEnabled'] = b2RevoluteJoint.prototype.IsLimitEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJoint_IsLimitEnabled_0(self));
};;

b2RevoluteJoint.prototype['EnableLimit'] = b2RevoluteJoint.prototype.EnableLimit = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJoint_EnableLimit_1(self, arg0);
};;

b2RevoluteJoint.prototype['GetLowerLimit'] = b2RevoluteJoint.prototype.GetLowerLimit = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetLowerLimit_0(self);
};;

b2RevoluteJoint.prototype['GetUpperLimit'] = b2RevoluteJoint.prototype.GetUpperLimit = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetUpperLimit_0(self);
};;

b2RevoluteJoint.prototype['SetLimits'] = b2RevoluteJoint.prototype.SetLimits = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2RevoluteJoint_SetLimits_2(self, arg0, arg1);
};;

b2RevoluteJoint.prototype['IsMotorEnabled'] = b2RevoluteJoint.prototype.IsMotorEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJoint_IsMotorEnabled_0(self));
};;

b2RevoluteJoint.prototype['EnableMotor'] = b2RevoluteJoint.prototype.EnableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJoint_EnableMotor_1(self, arg0);
};;

b2RevoluteJoint.prototype['SetMotorSpeed'] = b2RevoluteJoint.prototype.SetMotorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJoint_SetMotorSpeed_1(self, arg0);
};;

b2RevoluteJoint.prototype['GetMotorSpeed'] = b2RevoluteJoint.prototype.GetMotorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetMotorSpeed_0(self);
};;

b2RevoluteJoint.prototype['SetMaxMotorTorque'] = b2RevoluteJoint.prototype.SetMaxMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJoint_SetMaxMotorTorque_1(self, arg0);
};;

b2RevoluteJoint.prototype['GetMaxMotorTorque'] = b2RevoluteJoint.prototype.GetMaxMotorTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetMaxMotorTorque_0(self);
};;

b2RevoluteJoint.prototype['GetMotorTorque'] = b2RevoluteJoint.prototype.GetMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetMotorTorque_1(self, arg0);
};;

b2RevoluteJoint.prototype['GetType'] = b2RevoluteJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetType_0(self);
};;

b2RevoluteJoint.prototype['GetBodyA'] = b2RevoluteJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetBodyA_0(self), b2Body);
};;

b2RevoluteJoint.prototype['GetBodyB'] = b2RevoluteJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetBodyB_0(self), b2Body);
};;

b2RevoluteJoint.prototype['GetAnchorA'] = b2RevoluteJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetAnchorA_0(self), b2Vec2);
};;

b2RevoluteJoint.prototype['GetAnchorB'] = b2RevoluteJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetAnchorB_0(self), b2Vec2);
};;

b2RevoluteJoint.prototype['GetReactionForce'] = b2RevoluteJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2RevoluteJoint.prototype['GetReactionTorque'] = b2RevoluteJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetReactionTorque_1(self, arg0);
};;

b2RevoluteJoint.prototype['GetNext'] = b2RevoluteJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetNext_0(self), b2Joint);
};;

b2RevoluteJoint.prototype['GetUserData'] = b2RevoluteJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetUserData_0(self);
};;

b2RevoluteJoint.prototype['SetUserData'] = b2RevoluteJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJoint_SetUserData_1(self, arg0);
};;

b2RevoluteJoint.prototype['IsActive'] = b2RevoluteJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJoint_IsActive_0(self));
};;

b2RevoluteJoint.prototype['GetCollideConnected'] = b2RevoluteJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJoint_GetCollideConnected_0(self));
};;

  b2RevoluteJoint.prototype['__destroy__'] = b2RevoluteJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RevoluteJoint___destroy___0(self);
};
// b2ContactEdge
function b2ContactEdge() {
  this.ptr = _emscripten_bind_b2ContactEdge_b2ContactEdge_0();
  getCache(b2ContactEdge)[this.ptr] = this;
};;
b2ContactEdge.prototype = Object.create(WrapperObject.prototype);
b2ContactEdge.prototype.constructor = b2ContactEdge;
b2ContactEdge.prototype.__class__ = b2ContactEdge;
b2ContactEdge.__cache__ = {};
Module['b2ContactEdge'] = b2ContactEdge;

  b2ContactEdge.prototype['get_other'] = b2ContactEdge.prototype.get_other = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ContactEdge_get_other_0(self), b2Body);
};
    b2ContactEdge.prototype['set_other'] = b2ContactEdge.prototype.set_other = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactEdge_set_other_1(self, arg0);
};
  b2ContactEdge.prototype['get_contact'] = b2ContactEdge.prototype.get_contact = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ContactEdge_get_contact_0(self), b2Contact);
};
    b2ContactEdge.prototype['set_contact'] = b2ContactEdge.prototype.set_contact = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactEdge_set_contact_1(self, arg0);
};
  b2ContactEdge.prototype['get_prev'] = b2ContactEdge.prototype.get_prev = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ContactEdge_get_prev_0(self), b2ContactEdge);
};
    b2ContactEdge.prototype['set_prev'] = b2ContactEdge.prototype.set_prev = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactEdge_set_prev_1(self, arg0);
};
  b2ContactEdge.prototype['get_next'] = b2ContactEdge.prototype.get_next = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ContactEdge_get_next_0(self), b2ContactEdge);
};
    b2ContactEdge.prototype['set_next'] = b2ContactEdge.prototype.set_next = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactEdge_set_next_1(self, arg0);
};
  b2ContactEdge.prototype['__destroy__'] = b2ContactEdge.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactEdge___destroy___0(self);
};
// b2RopeJointDef
function b2RopeJointDef() {
  this.ptr = _emscripten_bind_b2RopeJointDef_b2RopeJointDef_0();
  getCache(b2RopeJointDef)[this.ptr] = this;
};;
b2RopeJointDef.prototype = Object.create(b2JointDef.prototype);
b2RopeJointDef.prototype.constructor = b2RopeJointDef;
b2RopeJointDef.prototype.__class__ = b2RopeJointDef;
b2RopeJointDef.__cache__ = {};
Module['b2RopeJointDef'] = b2RopeJointDef;

  b2RopeJointDef.prototype['get_localAnchorA'] = b2RopeJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2RopeJointDef.prototype['set_localAnchorA'] = b2RopeJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_localAnchorA_1(self, arg0);
};
  b2RopeJointDef.prototype['get_localAnchorB'] = b2RopeJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2RopeJointDef.prototype['set_localAnchorB'] = b2RopeJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_localAnchorB_1(self, arg0);
};
  b2RopeJointDef.prototype['get_maxLength'] = b2RopeJointDef.prototype.get_maxLength = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJointDef_get_maxLength_0(self);
};
    b2RopeJointDef.prototype['set_maxLength'] = b2RopeJointDef.prototype.set_maxLength = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_maxLength_1(self, arg0);
};
  b2RopeJointDef.prototype['get_type'] = b2RopeJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJointDef_get_type_0(self);
};
    b2RopeJointDef.prototype['set_type'] = b2RopeJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_type_1(self, arg0);
};
  b2RopeJointDef.prototype['get_userData'] = b2RopeJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJointDef_get_userData_0(self);
};
    b2RopeJointDef.prototype['set_userData'] = b2RopeJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_userData_1(self, arg0);
};
  b2RopeJointDef.prototype['get_bodyA'] = b2RopeJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJointDef_get_bodyA_0(self), b2Body);
};
    b2RopeJointDef.prototype['set_bodyA'] = b2RopeJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_bodyA_1(self, arg0);
};
  b2RopeJointDef.prototype['get_bodyB'] = b2RopeJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJointDef_get_bodyB_0(self), b2Body);
};
    b2RopeJointDef.prototype['set_bodyB'] = b2RopeJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_bodyB_1(self, arg0);
};
  b2RopeJointDef.prototype['get_collideConnected'] = b2RopeJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RopeJointDef_get_collideConnected_0(self));
};
    b2RopeJointDef.prototype['set_collideConnected'] = b2RopeJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_collideConnected_1(self, arg0);
};
  b2RopeJointDef.prototype['__destroy__'] = b2RopeJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RopeJointDef___destroy___0(self);
};
// b2MotorJointDef
function b2MotorJointDef() {
  this.ptr = _emscripten_bind_b2MotorJointDef_b2MotorJointDef_0();
  getCache(b2MotorJointDef)[this.ptr] = this;
};;
b2MotorJointDef.prototype = Object.create(b2JointDef.prototype);
b2MotorJointDef.prototype.constructor = b2MotorJointDef;
b2MotorJointDef.prototype.__class__ = b2MotorJointDef;
b2MotorJointDef.__cache__ = {};
Module['b2MotorJointDef'] = b2MotorJointDef;

b2MotorJointDef.prototype['Initialize'] = b2MotorJointDef.prototype.Initialize = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2MotorJointDef_Initialize_2(self, arg0, arg1);
};;

  b2MotorJointDef.prototype['get_linearOffset'] = b2MotorJointDef.prototype.get_linearOffset = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJointDef_get_linearOffset_0(self), b2Vec2);
};
    b2MotorJointDef.prototype['set_linearOffset'] = b2MotorJointDef.prototype.set_linearOffset = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_linearOffset_1(self, arg0);
};
  b2MotorJointDef.prototype['get_angularOffset'] = b2MotorJointDef.prototype.get_angularOffset = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_angularOffset_0(self);
};
    b2MotorJointDef.prototype['set_angularOffset'] = b2MotorJointDef.prototype.set_angularOffset = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_angularOffset_1(self, arg0);
};
  b2MotorJointDef.prototype['get_maxForce'] = b2MotorJointDef.prototype.get_maxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_maxForce_0(self);
};
    b2MotorJointDef.prototype['set_maxForce'] = b2MotorJointDef.prototype.set_maxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_maxForce_1(self, arg0);
};
  b2MotorJointDef.prototype['get_maxTorque'] = b2MotorJointDef.prototype.get_maxTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_maxTorque_0(self);
};
    b2MotorJointDef.prototype['set_maxTorque'] = b2MotorJointDef.prototype.set_maxTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_maxTorque_1(self, arg0);
};
  b2MotorJointDef.prototype['get_correctionFactor'] = b2MotorJointDef.prototype.get_correctionFactor = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_correctionFactor_0(self);
};
    b2MotorJointDef.prototype['set_correctionFactor'] = b2MotorJointDef.prototype.set_correctionFactor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_correctionFactor_1(self, arg0);
};
  b2MotorJointDef.prototype['get_type'] = b2MotorJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_type_0(self);
};
    b2MotorJointDef.prototype['set_type'] = b2MotorJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_type_1(self, arg0);
};
  b2MotorJointDef.prototype['get_userData'] = b2MotorJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_userData_0(self);
};
    b2MotorJointDef.prototype['set_userData'] = b2MotorJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_userData_1(self, arg0);
};
  b2MotorJointDef.prototype['get_bodyA'] = b2MotorJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJointDef_get_bodyA_0(self), b2Body);
};
    b2MotorJointDef.prototype['set_bodyA'] = b2MotorJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_bodyA_1(self, arg0);
};
  b2MotorJointDef.prototype['get_bodyB'] = b2MotorJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJointDef_get_bodyB_0(self), b2Body);
};
    b2MotorJointDef.prototype['set_bodyB'] = b2MotorJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_bodyB_1(self, arg0);
};
  b2MotorJointDef.prototype['get_collideConnected'] = b2MotorJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MotorJointDef_get_collideConnected_0(self));
};
    b2MotorJointDef.prototype['set_collideConnected'] = b2MotorJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_collideConnected_1(self, arg0);
};
  b2MotorJointDef.prototype['__destroy__'] = b2MotorJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2MotorJointDef___destroy___0(self);
};
(function() {
  function setupEnums() {
    

    // b2ShapeType

    Module['b2Shape']['e_circle'] = _emscripten_enum_b2ShapeType_e_circle();

    Module['b2Shape']['e_edge'] = _emscripten_enum_b2ShapeType_e_edge();

    Module['b2Shape']['e_polygon'] = _emscripten_enum_b2ShapeType_e_polygon();

    Module['b2Shape']['e_chain'] = _emscripten_enum_b2ShapeType_e_chain();

    Module['b2Shape']['e_typeCount'] = _emscripten_enum_b2ShapeType_e_typeCount();

    

    // b2JointType

    Module['e_unknownJoint'] = _emscripten_enum_b2JointType_e_unknownJoint();

    Module['e_revoluteJoint'] = _emscripten_enum_b2JointType_e_revoluteJoint();

    Module['e_prismaticJoint'] = _emscripten_enum_b2JointType_e_prismaticJoint();

    Module['e_distanceJoint'] = _emscripten_enum_b2JointType_e_distanceJoint();

    Module['e_pulleyJoint'] = _emscripten_enum_b2JointType_e_pulleyJoint();

    Module['e_mouseJoint'] = _emscripten_enum_b2JointType_e_mouseJoint();

    Module['e_gearJoint'] = _emscripten_enum_b2JointType_e_gearJoint();

    Module['e_wheelJoint'] = _emscripten_enum_b2JointType_e_wheelJoint();

    Module['e_weldJoint'] = _emscripten_enum_b2JointType_e_weldJoint();

    Module['e_frictionJoint'] = _emscripten_enum_b2JointType_e_frictionJoint();

    Module['e_ropeJoint'] = _emscripten_enum_b2JointType_e_ropeJoint();

    Module['e_motorJoint'] = _emscripten_enum_b2JointType_e_motorJoint();

    

    // b2LimitState

    Module['e_inactiveLimit'] = _emscripten_enum_b2LimitState_e_inactiveLimit();

    Module['e_atLowerLimit'] = _emscripten_enum_b2LimitState_e_atLowerLimit();

    Module['e_atUpperLimit'] = _emscripten_enum_b2LimitState_e_atUpperLimit();

    Module['e_equalLimits'] = _emscripten_enum_b2LimitState_e_equalLimits();

    

    // b2ManifoldType

    Module['b2Manifold']['e_circles'] = _emscripten_enum_b2ManifoldType_e_circles();

    Module['b2Manifold']['e_faceA'] = _emscripten_enum_b2ManifoldType_e_faceA();

    Module['b2Manifold']['e_faceB'] = _emscripten_enum_b2ManifoldType_e_faceB();

    

    // b2BodyType

    Module['b2_staticBody'] = _emscripten_enum_b2BodyType_b2_staticBody();

    Module['b2_kinematicBody'] = _emscripten_enum_b2BodyType_b2_kinematicBody();

    Module['b2_dynamicBody'] = _emscripten_enum_b2BodyType_b2_dynamicBody();

    

    // b2DrawFlag

    Module['b2Draw']['e_shapeBit'] = _emscripten_enum_b2DrawFlag_e_shapeBit();

    Module['b2Draw']['e_jointBit'] = _emscripten_enum_b2DrawFlag_e_jointBit();

    Module['b2Draw']['e_aabbBit'] = _emscripten_enum_b2DrawFlag_e_aabbBit();

    Module['b2Draw']['e_pairBit'] = _emscripten_enum_b2DrawFlag_e_pairBit();

    Module['b2Draw']['e_centerOfMassBit'] = _emscripten_enum_b2DrawFlag_e_centerOfMassBit();

    

    // b2ContactFeatureType

    Module['b2ContactFeature']['e_vertex'] = _emscripten_enum_b2ContactFeatureType_e_vertex();

    Module['b2ContactFeature']['e_face'] = _emscripten_enum_b2ContactFeatureType_e_face();

  }
  if (Module['calledRun']) setupEnums();
  else addOnPreMain(setupEnums);
})();


// Bindings utilities

function WrapperObject() {
}
WrapperObject.prototype = Object.create(WrapperObject.prototype);
WrapperObject.prototype.constructor = WrapperObject;
WrapperObject.prototype.__class__ = WrapperObject;
WrapperObject.__cache__ = {};
Module['WrapperObject'] = WrapperObject;

function getCache(__class__) {
  return (__class__ || WrapperObject).__cache__;
}
Module['getCache'] = getCache;

function wrapPointer(ptr, __class__) {
  var cache = getCache(__class__);
  var ret = cache[ptr];
  if (ret) return ret;
  ret = Object.create((__class__ || WrapperObject).prototype);
  ret.ptr = ptr;
  return cache[ptr] = ret;
}
Module['wrapPointer'] = wrapPointer;

function castObject(obj, __class__) {
  return wrapPointer(obj.ptr, __class__);
}
Module['castObject'] = castObject;

Module['NULL'] = wrapPointer(0);

function destroy(obj) {
  if (!obj['__destroy__']) throw 'Error: Cannot destroy object. (Did you create it yourself?)';
  obj['__destroy__']();
  // Remove from cache, so the object can be GC'd and refs added onto it released
  delete getCache(obj.__class__)[obj.ptr];
}
Module['destroy'] = destroy;

function compare(obj1, obj2) {
  return obj1.ptr === obj2.ptr;
}
Module['compare'] = compare;

function getPointer(obj) {
  return obj.ptr;
}
Module['getPointer'] = getPointer;

function getClass(obj) {
  return obj.__class__;
}
Module['getClass'] = getClass;

// Converts big (string or array) values into a C-style storage, in temporary space

var ensureCache = {
  buffer: 0,  // the main buffer of temporary storage
  size: 0,   // the size of buffer
  pos: 0,    // the next free offset in buffer
  temps: [], // extra allocations
  needed: 0, // the total size we need next time

  prepare: function() {
    if (this.needed) {
      // clear the temps
      for (var i = 0; i < this.temps.length; i++) {
        Module['_free'](this.temps[i]);
      }
      this.temps.length = 0;
      // prepare to allocate a bigger buffer
      Module['_free'](this.buffer);
      this.buffer = 0;
      this.size += this.needed;
      // clean up
      this.needed = 0;
    }
    if (!this.buffer) { // happens first time, or when we need to grow
      this.size += 128; // heuristic, avoid many small grow events
      this.buffer = Module['_malloc'](this.size);
      assert(this.buffer);
    }
    this.pos = 0;
  },
  alloc: function(array, view) {
    assert(this.buffer);
    var bytes = view.BYTES_PER_ELEMENT;
    var len = array.length * bytes;
    len = (len + 7) & -8; // keep things aligned to 8 byte boundaries
    var ret;
    if (this.pos + len >= this.size) {
      // we failed to allocate in the buffer, this time around :(
      assert(len > 0); // null terminator, at least
      this.needed += len;
      ret = Module['_malloc'](len);
      this.temps.push(ret);
    } else {
      // we can allocate in the buffer
      ret = this.buffer + this.pos;
      this.pos += len;
    }
    var retShifted = ret;
    switch (bytes) {
      case 2: retShifted >>= 1; break;
      case 4: retShifted >>= 2; break;
      case 8: retShifted >>= 3; break;
    }
    for (var i = 0; i < array.length; i++) {
      view[retShifted + i] = array[i];
    }
    return ret;
  },
};

function ensureString(value) {
  if (typeof value === 'string') return ensureCache.alloc(intArrayFromString(value), HEAP8);
  return value;
}
function ensureInt8(value) {
  if (typeof value === 'object') return ensureCache.alloc(value, HEAP8);
  return value;
}
function ensureInt16(value) {
  if (typeof value === 'object') return ensureCache.alloc(value, HEAP16);
  return value;
}
function ensureInt32(value) {
  if (typeof value === 'object') return ensureCache.alloc(value, HEAP32);
  return value;
}
function ensureFloat32(value) {
  if (typeof value === 'object') return ensureCache.alloc(value, HEAPF32);
  return value;
}
function ensureFloat64(value) {
  if (typeof value === 'object') return ensureCache.alloc(value, HEAPF64);
  return value;
}


// b2DestructionListenerWrapper
function b2DestructionListenerWrapper() { throw "cannot construct a b2DestructionListenerWrapper, no constructor in IDL" }
b2DestructionListenerWrapper.prototype = Object.create(WrapperObject.prototype);
b2DestructionListenerWrapper.prototype.constructor = b2DestructionListenerWrapper;
b2DestructionListenerWrapper.prototype.__class__ = b2DestructionListenerWrapper;
b2DestructionListenerWrapper.__cache__ = {};
Module['b2DestructionListenerWrapper'] = b2DestructionListenerWrapper;

  b2DestructionListenerWrapper.prototype['__destroy__'] = b2DestructionListenerWrapper.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2DestructionListenerWrapper___destroy___0(self);
};
// b2Draw
function b2Draw() { throw "cannot construct a b2Draw, no constructor in IDL" }
b2Draw.prototype = Object.create(WrapperObject.prototype);
b2Draw.prototype.constructor = b2Draw;
b2Draw.prototype.__class__ = b2Draw;
b2Draw.__cache__ = {};
Module['b2Draw'] = b2Draw;

b2Draw.prototype['SetFlags'] = b2Draw.prototype.SetFlags = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Draw_SetFlags_1(self, arg0);
};;

b2Draw.prototype['GetFlags'] = b2Draw.prototype.GetFlags = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Draw_GetFlags_0(self);
};;

b2Draw.prototype['AppendFlags'] = b2Draw.prototype.AppendFlags = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Draw_AppendFlags_1(self, arg0);
};;

b2Draw.prototype['ClearFlags'] = b2Draw.prototype.ClearFlags = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Draw_ClearFlags_1(self, arg0);
};;

  b2Draw.prototype['__destroy__'] = b2Draw.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Draw___destroy___0(self);
};
// b2Joint
function b2Joint() { throw "cannot construct a b2Joint, no constructor in IDL" }
b2Joint.prototype = Object.create(WrapperObject.prototype);
b2Joint.prototype.constructor = b2Joint;
b2Joint.prototype.__class__ = b2Joint;
b2Joint.__cache__ = {};
Module['b2Joint'] = b2Joint;

b2Joint.prototype['GetType'] = b2Joint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Joint_GetType_0(self);
};;

b2Joint.prototype['GetBodyA'] = b2Joint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetBodyA_0(self), b2Body);
};;

b2Joint.prototype['GetBodyB'] = b2Joint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetBodyB_0(self), b2Body);
};;

b2Joint.prototype['GetAnchorA'] = b2Joint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetAnchorA_0(self), b2Vec2);
};;

b2Joint.prototype['GetAnchorB'] = b2Joint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetAnchorB_0(self), b2Vec2);
};;

b2Joint.prototype['GetReactionForce'] = b2Joint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2Joint.prototype['GetReactionTorque'] = b2Joint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2Joint_GetReactionTorque_1(self, arg0);
};;

b2Joint.prototype['GetNext'] = b2Joint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Joint_GetNext_0(self), b2Joint);
};;

b2Joint.prototype['GetUserData'] = b2Joint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Joint_GetUserData_0(self);
};;

b2Joint.prototype['SetUserData'] = b2Joint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Joint_SetUserData_1(self, arg0);
};;

b2Joint.prototype['IsActive'] = b2Joint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Joint_IsActive_0(self));
};;

b2Joint.prototype['GetCollideConnected'] = b2Joint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Joint_GetCollideConnected_0(self));
};;

b2Joint.prototype['Dump'] = b2Joint.prototype.Dump = function() {
  var self = this.ptr;
  _emscripten_bind_b2Joint_Dump_0(self);
};;

// b2RayCastCallback
function b2RayCastCallback() { throw "cannot construct a b2RayCastCallback, no constructor in IDL" }
b2RayCastCallback.prototype = Object.create(WrapperObject.prototype);
b2RayCastCallback.prototype.constructor = b2RayCastCallback;
b2RayCastCallback.prototype.__class__ = b2RayCastCallback;
b2RayCastCallback.__cache__ = {};
Module['b2RayCastCallback'] = b2RayCastCallback;

  b2RayCastCallback.prototype['__destroy__'] = b2RayCastCallback.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RayCastCallback___destroy___0(self);
};
// b2ContactListener
function b2ContactListener() { throw "cannot construct a b2ContactListener, no constructor in IDL" }
b2ContactListener.prototype = Object.create(WrapperObject.prototype);
b2ContactListener.prototype.constructor = b2ContactListener;
b2ContactListener.prototype.__class__ = b2ContactListener;
b2ContactListener.__cache__ = {};
Module['b2ContactListener'] = b2ContactListener;

  b2ContactListener.prototype['__destroy__'] = b2ContactListener.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactListener___destroy___0(self);
};
// b2QueryCallback
function b2QueryCallback() { throw "cannot construct a b2QueryCallback, no constructor in IDL" }
b2QueryCallback.prototype = Object.create(WrapperObject.prototype);
b2QueryCallback.prototype.constructor = b2QueryCallback;
b2QueryCallback.prototype.__class__ = b2QueryCallback;
b2QueryCallback.__cache__ = {};
Module['b2QueryCallback'] = b2QueryCallback;

  b2QueryCallback.prototype['__destroy__'] = b2QueryCallback.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2QueryCallback___destroy___0(self);
};
// b2JointDef
function b2JointDef() {
  this.ptr = _emscripten_bind_b2JointDef_b2JointDef_0();
  getCache(b2JointDef)[this.ptr] = this;
};;
b2JointDef.prototype = Object.create(WrapperObject.prototype);
b2JointDef.prototype.constructor = b2JointDef;
b2JointDef.prototype.__class__ = b2JointDef;
b2JointDef.__cache__ = {};
Module['b2JointDef'] = b2JointDef;

  b2JointDef.prototype['get_type'] = b2JointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2JointDef_get_type_0(self);
};
    b2JointDef.prototype['set_type'] = b2JointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointDef_set_type_1(self, arg0);
};
  b2JointDef.prototype['get_userData'] = b2JointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2JointDef_get_userData_0(self);
};
    b2JointDef.prototype['set_userData'] = b2JointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointDef_set_userData_1(self, arg0);
};
  b2JointDef.prototype['get_bodyA'] = b2JointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointDef_get_bodyA_0(self), b2Body);
};
    b2JointDef.prototype['set_bodyA'] = b2JointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointDef_set_bodyA_1(self, arg0);
};
  b2JointDef.prototype['get_bodyB'] = b2JointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointDef_get_bodyB_0(self), b2Body);
};
    b2JointDef.prototype['set_bodyB'] = b2JointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointDef_set_bodyB_1(self, arg0);
};
  b2JointDef.prototype['get_collideConnected'] = b2JointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2JointDef_get_collideConnected_0(self));
};
    b2JointDef.prototype['set_collideConnected'] = b2JointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointDef_set_collideConnected_1(self, arg0);
};
  b2JointDef.prototype['__destroy__'] = b2JointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2JointDef___destroy___0(self);
};
// b2Shape
function b2Shape() { throw "cannot construct a b2Shape, no constructor in IDL" }
b2Shape.prototype = Object.create(WrapperObject.prototype);
b2Shape.prototype.constructor = b2Shape;
b2Shape.prototype.__class__ = b2Shape;
b2Shape.__cache__ = {};
Module['b2Shape'] = b2Shape;

b2Shape.prototype['GetType'] = b2Shape.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Shape_GetType_0(self);
};;

b2Shape.prototype['GetChildCount'] = b2Shape.prototype.GetChildCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Shape_GetChildCount_0(self);
};;

b2Shape.prototype['TestPoint'] = b2Shape.prototype.TestPoint = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2Shape_TestPoint_2(self, arg0, arg1));
};;

b2Shape.prototype['RayCast'] = b2Shape.prototype.RayCast = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return !!(_emscripten_bind_b2Shape_RayCast_4(self, arg0, arg1, arg2, arg3));
};;

b2Shape.prototype['ComputeAABB'] = b2Shape.prototype.ComputeAABB = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2Shape_ComputeAABB_3(self, arg0, arg1, arg2);
};;

b2Shape.prototype['ComputeMass'] = b2Shape.prototype.ComputeMass = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Shape_ComputeMass_2(self, arg0, arg1);
};;

  b2Shape.prototype['get_m_type'] = b2Shape.prototype.get_m_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Shape_get_m_type_0(self);
};
    b2Shape.prototype['set_m_type'] = b2Shape.prototype.set_m_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Shape_set_m_type_1(self, arg0);
};
  b2Shape.prototype['get_m_radius'] = b2Shape.prototype.get_m_radius = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Shape_get_m_radius_0(self);
};
    b2Shape.prototype['set_m_radius'] = b2Shape.prototype.set_m_radius = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Shape_set_m_radius_1(self, arg0);
};
  b2Shape.prototype['__destroy__'] = b2Shape.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Shape___destroy___0(self);
};
// b2ContactFilter
function b2ContactFilter() { throw "cannot construct a b2ContactFilter, no constructor in IDL" }
b2ContactFilter.prototype = Object.create(WrapperObject.prototype);
b2ContactFilter.prototype.constructor = b2ContactFilter;
b2ContactFilter.prototype.__class__ = b2ContactFilter;
b2ContactFilter.__cache__ = {};
Module['b2ContactFilter'] = b2ContactFilter;

  b2ContactFilter.prototype['__destroy__'] = b2ContactFilter.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactFilter___destroy___0(self);
};
// JSDestructionListener
function JSDestructionListener() {
  this.ptr = _emscripten_bind_JSDestructionListener_JSDestructionListener_0();
  getCache(JSDestructionListener)[this.ptr] = this;
};;
JSDestructionListener.prototype = Object.create(b2DestructionListenerWrapper.prototype);
JSDestructionListener.prototype.constructor = JSDestructionListener;
JSDestructionListener.prototype.__class__ = JSDestructionListener;
JSDestructionListener.__cache__ = {};
Module['JSDestructionListener'] = JSDestructionListener;

JSDestructionListener.prototype['SayGoodbyeJoint'] = JSDestructionListener.prototype.SayGoodbyeJoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_JSDestructionListener_SayGoodbyeJoint_1(self, arg0);
};;

JSDestructionListener.prototype['SayGoodbyeFixture'] = JSDestructionListener.prototype.SayGoodbyeFixture = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_JSDestructionListener_SayGoodbyeFixture_1(self, arg0);
};;

  JSDestructionListener.prototype['__destroy__'] = JSDestructionListener.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSDestructionListener___destroy___0(self);
};
// b2ContactImpulse
function b2ContactImpulse() { throw "cannot construct a b2ContactImpulse, no constructor in IDL" }
b2ContactImpulse.prototype = Object.create(WrapperObject.prototype);
b2ContactImpulse.prototype.constructor = b2ContactImpulse;
b2ContactImpulse.prototype.__class__ = b2ContactImpulse;
b2ContactImpulse.__cache__ = {};
Module['b2ContactImpulse'] = b2ContactImpulse;

  b2ContactImpulse.prototype['get_count'] = b2ContactImpulse.prototype.get_count = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactImpulse_get_count_0(self);
};
    b2ContactImpulse.prototype['set_count'] = b2ContactImpulse.prototype.set_count = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactImpulse_set_count_1(self, arg0);
};
  b2ContactImpulse.prototype['__destroy__'] = b2ContactImpulse.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactImpulse___destroy___0(self);
};
// b2DistanceJoint
function b2DistanceJoint() { throw "cannot construct a b2DistanceJoint, no constructor in IDL" }
b2DistanceJoint.prototype = Object.create(b2Joint.prototype);
b2DistanceJoint.prototype.constructor = b2DistanceJoint;
b2DistanceJoint.prototype.__class__ = b2DistanceJoint;
b2DistanceJoint.__cache__ = {};
Module['b2DistanceJoint'] = b2DistanceJoint;

b2DistanceJoint.prototype['GetLocalAnchorA'] = b2DistanceJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2DistanceJoint.prototype['GetLocalAnchorB'] = b2DistanceJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2DistanceJoint.prototype['SetLength'] = b2DistanceJoint.prototype.SetLength = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJoint_SetLength_1(self, arg0);
};;

b2DistanceJoint.prototype['GetLength'] = b2DistanceJoint.prototype.GetLength = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJoint_GetLength_0(self);
};;

b2DistanceJoint.prototype['SetFrequency'] = b2DistanceJoint.prototype.SetFrequency = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJoint_SetFrequency_1(self, arg0);
};;

b2DistanceJoint.prototype['GetFrequency'] = b2DistanceJoint.prototype.GetFrequency = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJoint_GetFrequency_0(self);
};;

b2DistanceJoint.prototype['SetDampingRatio'] = b2DistanceJoint.prototype.SetDampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJoint_SetDampingRatio_1(self, arg0);
};;

b2DistanceJoint.prototype['GetDampingRatio'] = b2DistanceJoint.prototype.GetDampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJoint_GetDampingRatio_0(self);
};;

b2DistanceJoint.prototype['GetType'] = b2DistanceJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJoint_GetType_0(self);
};;

b2DistanceJoint.prototype['GetBodyA'] = b2DistanceJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetBodyA_0(self), b2Body);
};;

b2DistanceJoint.prototype['GetBodyB'] = b2DistanceJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetBodyB_0(self), b2Body);
};;

b2DistanceJoint.prototype['GetAnchorA'] = b2DistanceJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetAnchorA_0(self), b2Vec2);
};;

b2DistanceJoint.prototype['GetAnchorB'] = b2DistanceJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetAnchorB_0(self), b2Vec2);
};;

b2DistanceJoint.prototype['GetReactionForce'] = b2DistanceJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2DistanceJoint.prototype['GetReactionTorque'] = b2DistanceJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2DistanceJoint_GetReactionTorque_1(self, arg0);
};;

b2DistanceJoint.prototype['GetNext'] = b2DistanceJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJoint_GetNext_0(self), b2Joint);
};;

b2DistanceJoint.prototype['GetUserData'] = b2DistanceJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJoint_GetUserData_0(self);
};;

b2DistanceJoint.prototype['SetUserData'] = b2DistanceJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJoint_SetUserData_1(self, arg0);
};;

b2DistanceJoint.prototype['IsActive'] = b2DistanceJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2DistanceJoint_IsActive_0(self));
};;

b2DistanceJoint.prototype['GetCollideConnected'] = b2DistanceJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2DistanceJoint_GetCollideConnected_0(self));
};;

  b2DistanceJoint.prototype['__destroy__'] = b2DistanceJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2DistanceJoint___destroy___0(self);
};
// b2Mat33
function b2Mat33(arg0, arg1, arg2) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Mat33_b2Mat33_0(); getCache(b2Mat33)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Mat33_b2Mat33_1(arg0); getCache(b2Mat33)[this.ptr] = this;return }
  if (arg2 === undefined) { this.ptr = _emscripten_bind_b2Mat33_b2Mat33_2(arg0, arg1); getCache(b2Mat33)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Mat33_b2Mat33_3(arg0, arg1, arg2);
  getCache(b2Mat33)[this.ptr] = this;
};;
b2Mat33.prototype = Object.create(WrapperObject.prototype);
b2Mat33.prototype.constructor = b2Mat33;
b2Mat33.prototype.__class__ = b2Mat33;
b2Mat33.__cache__ = {};
Module['b2Mat33'] = b2Mat33;

b2Mat33.prototype['SetZero'] = b2Mat33.prototype.SetZero = function() {
  var self = this.ptr;
  _emscripten_bind_b2Mat33_SetZero_0(self);
};;

b2Mat33.prototype['Solve33'] = b2Mat33.prototype.Solve33 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Mat33_Solve33_1(self, arg0), b2Vec3);
};;

b2Mat33.prototype['Solve22'] = b2Mat33.prototype.Solve22 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Mat33_Solve22_1(self, arg0), b2Vec2);
};;

b2Mat33.prototype['GetInverse22'] = b2Mat33.prototype.GetInverse22 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat33_GetInverse22_1(self, arg0);
};;

b2Mat33.prototype['GetSymInverse33'] = b2Mat33.prototype.GetSymInverse33 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat33_GetSymInverse33_1(self, arg0);
};;

  b2Mat33.prototype['get_ex'] = b2Mat33.prototype.get_ex = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat33_get_ex_0(self), b2Vec3);
};
    b2Mat33.prototype['set_ex'] = b2Mat33.prototype.set_ex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat33_set_ex_1(self, arg0);
};
  b2Mat33.prototype['get_ey'] = b2Mat33.prototype.get_ey = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat33_get_ey_0(self), b2Vec3);
};
    b2Mat33.prototype['set_ey'] = b2Mat33.prototype.set_ey = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat33_set_ey_1(self, arg0);
};
  b2Mat33.prototype['get_ez'] = b2Mat33.prototype.get_ez = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat33_get_ez_0(self), b2Vec3);
};
    b2Mat33.prototype['set_ez'] = b2Mat33.prototype.set_ez = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat33_set_ez_1(self, arg0);
};
  b2Mat33.prototype['__destroy__'] = b2Mat33.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Mat33___destroy___0(self);
};
// b2Fixture
function b2Fixture() { throw "cannot construct a b2Fixture, no constructor in IDL" }
b2Fixture.prototype = Object.create(WrapperObject.prototype);
b2Fixture.prototype.constructor = b2Fixture;
b2Fixture.prototype.__class__ = b2Fixture;
b2Fixture.__cache__ = {};
Module['b2Fixture'] = b2Fixture;

b2Fixture.prototype['GetType'] = b2Fixture.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Fixture_GetType_0(self);
};;

b2Fixture.prototype['GetShape'] = b2Fixture.prototype.GetShape = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Fixture_GetShape_0(self), b2Shape);
};;

b2Fixture.prototype['SetSensor'] = b2Fixture.prototype.SetSensor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetSensor_1(self, arg0);
};;

b2Fixture.prototype['IsSensor'] = b2Fixture.prototype.IsSensor = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Fixture_IsSensor_0(self));
};;

b2Fixture.prototype['SetFilterData'] = b2Fixture.prototype.SetFilterData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetFilterData_1(self, arg0);
};;

b2Fixture.prototype['GetFilterData'] = b2Fixture.prototype.GetFilterData = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Fixture_GetFilterData_0(self), b2Filter);
};;

b2Fixture.prototype['Refilter'] = b2Fixture.prototype.Refilter = function() {
  var self = this.ptr;
  _emscripten_bind_b2Fixture_Refilter_0(self);
};;

b2Fixture.prototype['GetBody'] = b2Fixture.prototype.GetBody = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Fixture_GetBody_0(self), b2Body);
};;

b2Fixture.prototype['GetNext'] = b2Fixture.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Fixture_GetNext_0(self), b2Fixture);
};;

b2Fixture.prototype['GetUserData'] = b2Fixture.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Fixture_GetUserData_0(self);
};;

b2Fixture.prototype['SetUserData'] = b2Fixture.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetUserData_1(self, arg0);
};;

b2Fixture.prototype['TestPoint'] = b2Fixture.prototype.TestPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return !!(_emscripten_bind_b2Fixture_TestPoint_1(self, arg0));
};;

b2Fixture.prototype['RayCast'] = b2Fixture.prototype.RayCast = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  return !!(_emscripten_bind_b2Fixture_RayCast_3(self, arg0, arg1, arg2));
};;

b2Fixture.prototype['GetMassData'] = b2Fixture.prototype.GetMassData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_GetMassData_1(self, arg0);
};;

b2Fixture.prototype['SetDensity'] = b2Fixture.prototype.SetDensity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetDensity_1(self, arg0);
};;

b2Fixture.prototype['GetDensity'] = b2Fixture.prototype.GetDensity = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Fixture_GetDensity_0(self);
};;

b2Fixture.prototype['GetFriction'] = b2Fixture.prototype.GetFriction = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Fixture_GetFriction_0(self);
};;

b2Fixture.prototype['SetFriction'] = b2Fixture.prototype.SetFriction = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetFriction_1(self, arg0);
};;

b2Fixture.prototype['GetRestitution'] = b2Fixture.prototype.GetRestitution = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Fixture_GetRestitution_0(self);
};;

b2Fixture.prototype['SetRestitution'] = b2Fixture.prototype.SetRestitution = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_SetRestitution_1(self, arg0);
};;

b2Fixture.prototype['GetAABB'] = b2Fixture.prototype.GetAABB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Fixture_GetAABB_1(self, arg0), b2AABB);
};;

b2Fixture.prototype['Dump'] = b2Fixture.prototype.Dump = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Fixture_Dump_1(self, arg0);
};;

  b2Fixture.prototype['__destroy__'] = b2Fixture.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Fixture___destroy___0(self);
};
// b2Filter
function b2Filter() {
  this.ptr = _emscripten_bind_b2Filter_b2Filter_0();
  getCache(b2Filter)[this.ptr] = this;
};;
b2Filter.prototype = Object.create(WrapperObject.prototype);
b2Filter.prototype.constructor = b2Filter;
b2Filter.prototype.__class__ = b2Filter;
b2Filter.__cache__ = {};
Module['b2Filter'] = b2Filter;

  b2Filter.prototype['get_categoryBits'] = b2Filter.prototype.get_categoryBits = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Filter_get_categoryBits_0(self);
};
    b2Filter.prototype['set_categoryBits'] = b2Filter.prototype.set_categoryBits = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Filter_set_categoryBits_1(self, arg0);
};
  b2Filter.prototype['get_maskBits'] = b2Filter.prototype.get_maskBits = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Filter_get_maskBits_0(self);
};
    b2Filter.prototype['set_maskBits'] = b2Filter.prototype.set_maskBits = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Filter_set_maskBits_1(self, arg0);
};
  b2Filter.prototype['get_groupIndex'] = b2Filter.prototype.get_groupIndex = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Filter_get_groupIndex_0(self);
};
    b2Filter.prototype['set_groupIndex'] = b2Filter.prototype.set_groupIndex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Filter_set_groupIndex_1(self, arg0);
};
  b2Filter.prototype['__destroy__'] = b2Filter.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Filter___destroy___0(self);
};
// JSQueryCallback
function JSQueryCallback() {
  this.ptr = _emscripten_bind_JSQueryCallback_JSQueryCallback_0();
  getCache(JSQueryCallback)[this.ptr] = this;
};;
JSQueryCallback.prototype = Object.create(b2QueryCallback.prototype);
JSQueryCallback.prototype.constructor = JSQueryCallback;
JSQueryCallback.prototype.__class__ = JSQueryCallback;
JSQueryCallback.__cache__ = {};
Module['JSQueryCallback'] = JSQueryCallback;

JSQueryCallback.prototype['ReportFixture'] = JSQueryCallback.prototype.ReportFixture = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return !!(_emscripten_bind_JSQueryCallback_ReportFixture_1(self, arg0));
};;

  JSQueryCallback.prototype['__destroy__'] = JSQueryCallback.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSQueryCallback___destroy___0(self);
};
// b2MouseJoint
function b2MouseJoint() { throw "cannot construct a b2MouseJoint, no constructor in IDL" }
b2MouseJoint.prototype = Object.create(b2Joint.prototype);
b2MouseJoint.prototype.constructor = b2MouseJoint;
b2MouseJoint.prototype.__class__ = b2MouseJoint;
b2MouseJoint.__cache__ = {};
Module['b2MouseJoint'] = b2MouseJoint;

b2MouseJoint.prototype['SetTarget'] = b2MouseJoint.prototype.SetTarget = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJoint_SetTarget_1(self, arg0);
};;

b2MouseJoint.prototype['GetTarget'] = b2MouseJoint.prototype.GetTarget = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetTarget_0(self), b2Vec2);
};;

b2MouseJoint.prototype['SetMaxForce'] = b2MouseJoint.prototype.SetMaxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJoint_SetMaxForce_1(self, arg0);
};;

b2MouseJoint.prototype['GetMaxForce'] = b2MouseJoint.prototype.GetMaxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJoint_GetMaxForce_0(self);
};;

b2MouseJoint.prototype['SetFrequency'] = b2MouseJoint.prototype.SetFrequency = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJoint_SetFrequency_1(self, arg0);
};;

b2MouseJoint.prototype['GetFrequency'] = b2MouseJoint.prototype.GetFrequency = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJoint_GetFrequency_0(self);
};;

b2MouseJoint.prototype['SetDampingRatio'] = b2MouseJoint.prototype.SetDampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJoint_SetDampingRatio_1(self, arg0);
};;

b2MouseJoint.prototype['GetDampingRatio'] = b2MouseJoint.prototype.GetDampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJoint_GetDampingRatio_0(self);
};;

b2MouseJoint.prototype['GetType'] = b2MouseJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJoint_GetType_0(self);
};;

b2MouseJoint.prototype['GetBodyA'] = b2MouseJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetBodyA_0(self), b2Body);
};;

b2MouseJoint.prototype['GetBodyB'] = b2MouseJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetBodyB_0(self), b2Body);
};;

b2MouseJoint.prototype['GetAnchorA'] = b2MouseJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetAnchorA_0(self), b2Vec2);
};;

b2MouseJoint.prototype['GetAnchorB'] = b2MouseJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetAnchorB_0(self), b2Vec2);
};;

b2MouseJoint.prototype['GetReactionForce'] = b2MouseJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2MouseJoint.prototype['GetReactionTorque'] = b2MouseJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2MouseJoint_GetReactionTorque_1(self, arg0);
};;

b2MouseJoint.prototype['GetNext'] = b2MouseJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJoint_GetNext_0(self), b2Joint);
};;

b2MouseJoint.prototype['GetUserData'] = b2MouseJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJoint_GetUserData_0(self);
};;

b2MouseJoint.prototype['SetUserData'] = b2MouseJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJoint_SetUserData_1(self, arg0);
};;

b2MouseJoint.prototype['IsActive'] = b2MouseJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MouseJoint_IsActive_0(self));
};;

b2MouseJoint.prototype['GetCollideConnected'] = b2MouseJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MouseJoint_GetCollideConnected_0(self));
};;

  b2MouseJoint.prototype['__destroy__'] = b2MouseJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2MouseJoint___destroy___0(self);
};
// b2Rot
function b2Rot(arg0) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Rot_b2Rot_0(); getCache(b2Rot)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Rot_b2Rot_1(arg0);
  getCache(b2Rot)[this.ptr] = this;
};;
b2Rot.prototype = Object.create(WrapperObject.prototype);
b2Rot.prototype.constructor = b2Rot;
b2Rot.prototype.__class__ = b2Rot;
b2Rot.__cache__ = {};
Module['b2Rot'] = b2Rot;

b2Rot.prototype['Set'] = b2Rot.prototype.Set = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Rot_Set_1(self, arg0);
};;

b2Rot.prototype['SetIdentity'] = b2Rot.prototype.SetIdentity = function() {
  var self = this.ptr;
  _emscripten_bind_b2Rot_SetIdentity_0(self);
};;

b2Rot.prototype['GetAngle'] = b2Rot.prototype.GetAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Rot_GetAngle_0(self);
};;

b2Rot.prototype['GetXAxis'] = b2Rot.prototype.GetXAxis = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Rot_GetXAxis_0(self), b2Vec2);
};;

b2Rot.prototype['GetYAxis'] = b2Rot.prototype.GetYAxis = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Rot_GetYAxis_0(self), b2Vec2);
};;

  b2Rot.prototype['get_s'] = b2Rot.prototype.get_s = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Rot_get_s_0(self);
};
    b2Rot.prototype['set_s'] = b2Rot.prototype.set_s = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Rot_set_s_1(self, arg0);
};
  b2Rot.prototype['get_c'] = b2Rot.prototype.get_c = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Rot_get_c_0(self);
};
    b2Rot.prototype['set_c'] = b2Rot.prototype.set_c = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Rot_set_c_1(self, arg0);
};
  b2Rot.prototype['__destroy__'] = b2Rot.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Rot___destroy___0(self);
};
// b2MotorJoint
function b2MotorJoint() { throw "cannot construct a b2MotorJoint, no constructor in IDL" }
b2MotorJoint.prototype = Object.create(b2Joint.prototype);
b2MotorJoint.prototype.constructor = b2MotorJoint;
b2MotorJoint.prototype.__class__ = b2MotorJoint;
b2MotorJoint.__cache__ = {};
Module['b2MotorJoint'] = b2MotorJoint;

b2MotorJoint.prototype['SetLinearOffset'] = b2MotorJoint.prototype.SetLinearOffset = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetLinearOffset_1(self, arg0);
};;

b2MotorJoint.prototype['GetLinearOffset'] = b2MotorJoint.prototype.GetLinearOffset = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetLinearOffset_0(self), b2Vec2);
};;

b2MotorJoint.prototype['SetAngularOffset'] = b2MotorJoint.prototype.SetAngularOffset = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetAngularOffset_1(self, arg0);
};;

b2MotorJoint.prototype['GetAngularOffset'] = b2MotorJoint.prototype.GetAngularOffset = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetAngularOffset_0(self);
};;

b2MotorJoint.prototype['SetMaxForce'] = b2MotorJoint.prototype.SetMaxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetMaxForce_1(self, arg0);
};;

b2MotorJoint.prototype['GetMaxForce'] = b2MotorJoint.prototype.GetMaxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetMaxForce_0(self);
};;

b2MotorJoint.prototype['SetMaxTorque'] = b2MotorJoint.prototype.SetMaxTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetMaxTorque_1(self, arg0);
};;

b2MotorJoint.prototype['GetMaxTorque'] = b2MotorJoint.prototype.GetMaxTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetMaxTorque_0(self);
};;

b2MotorJoint.prototype['SetCorrectionFactor'] = b2MotorJoint.prototype.SetCorrectionFactor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetCorrectionFactor_1(self, arg0);
};;

b2MotorJoint.prototype['GetCorrectionFactor'] = b2MotorJoint.prototype.GetCorrectionFactor = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetCorrectionFactor_0(self);
};;

b2MotorJoint.prototype['GetType'] = b2MotorJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetType_0(self);
};;

b2MotorJoint.prototype['GetBodyA'] = b2MotorJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetBodyA_0(self), b2Body);
};;

b2MotorJoint.prototype['GetBodyB'] = b2MotorJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetBodyB_0(self), b2Body);
};;

b2MotorJoint.prototype['GetAnchorA'] = b2MotorJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetAnchorA_0(self), b2Vec2);
};;

b2MotorJoint.prototype['GetAnchorB'] = b2MotorJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetAnchorB_0(self), b2Vec2);
};;

b2MotorJoint.prototype['GetReactionForce'] = b2MotorJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2MotorJoint.prototype['GetReactionTorque'] = b2MotorJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2MotorJoint_GetReactionTorque_1(self, arg0);
};;

b2MotorJoint.prototype['GetNext'] = b2MotorJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJoint_GetNext_0(self), b2Joint);
};;

b2MotorJoint.prototype['GetUserData'] = b2MotorJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJoint_GetUserData_0(self);
};;

b2MotorJoint.prototype['SetUserData'] = b2MotorJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJoint_SetUserData_1(self, arg0);
};;

b2MotorJoint.prototype['IsActive'] = b2MotorJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MotorJoint_IsActive_0(self));
};;

b2MotorJoint.prototype['GetCollideConnected'] = b2MotorJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MotorJoint_GetCollideConnected_0(self));
};;

  b2MotorJoint.prototype['__destroy__'] = b2MotorJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2MotorJoint___destroy___0(self);
};
// b2Profile
function b2Profile() { throw "cannot construct a b2Profile, no constructor in IDL" }
b2Profile.prototype = Object.create(WrapperObject.prototype);
b2Profile.prototype.constructor = b2Profile;
b2Profile.prototype.__class__ = b2Profile;
b2Profile.__cache__ = {};
Module['b2Profile'] = b2Profile;

  b2Profile.prototype['get_step'] = b2Profile.prototype.get_step = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_step_0(self);
};
    b2Profile.prototype['set_step'] = b2Profile.prototype.set_step = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_step_1(self, arg0);
};
  b2Profile.prototype['get_collide'] = b2Profile.prototype.get_collide = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_collide_0(self);
};
    b2Profile.prototype['set_collide'] = b2Profile.prototype.set_collide = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_collide_1(self, arg0);
};
  b2Profile.prototype['get_solve'] = b2Profile.prototype.get_solve = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_solve_0(self);
};
    b2Profile.prototype['set_solve'] = b2Profile.prototype.set_solve = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_solve_1(self, arg0);
};
  b2Profile.prototype['get_solveInit'] = b2Profile.prototype.get_solveInit = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_solveInit_0(self);
};
    b2Profile.prototype['set_solveInit'] = b2Profile.prototype.set_solveInit = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_solveInit_1(self, arg0);
};
  b2Profile.prototype['get_solveVelocity'] = b2Profile.prototype.get_solveVelocity = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_solveVelocity_0(self);
};
    b2Profile.prototype['set_solveVelocity'] = b2Profile.prototype.set_solveVelocity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_solveVelocity_1(self, arg0);
};
  b2Profile.prototype['get_solvePosition'] = b2Profile.prototype.get_solvePosition = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_solvePosition_0(self);
};
    b2Profile.prototype['set_solvePosition'] = b2Profile.prototype.set_solvePosition = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_solvePosition_1(self, arg0);
};
  b2Profile.prototype['get_broadphase'] = b2Profile.prototype.get_broadphase = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_broadphase_0(self);
};
    b2Profile.prototype['set_broadphase'] = b2Profile.prototype.set_broadphase = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_broadphase_1(self, arg0);
};
  b2Profile.prototype['get_solveTOI'] = b2Profile.prototype.get_solveTOI = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Profile_get_solveTOI_0(self);
};
    b2Profile.prototype['set_solveTOI'] = b2Profile.prototype.set_solveTOI = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Profile_set_solveTOI_1(self, arg0);
};
  b2Profile.prototype['__destroy__'] = b2Profile.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Profile___destroy___0(self);
};
// VoidPtr
function VoidPtr() { throw "cannot construct a VoidPtr, no constructor in IDL" }
VoidPtr.prototype = Object.create(WrapperObject.prototype);
VoidPtr.prototype.constructor = VoidPtr;
VoidPtr.prototype.__class__ = VoidPtr;
VoidPtr.__cache__ = {};
Module['VoidPtr'] = VoidPtr;

  VoidPtr.prototype['__destroy__'] = VoidPtr.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_VoidPtr___destroy___0(self);
};
// b2BodyDef
function b2BodyDef() {
  this.ptr = _emscripten_bind_b2BodyDef_b2BodyDef_0();
  getCache(b2BodyDef)[this.ptr] = this;
};;
b2BodyDef.prototype = Object.create(WrapperObject.prototype);
b2BodyDef.prototype.constructor = b2BodyDef;
b2BodyDef.prototype.__class__ = b2BodyDef;
b2BodyDef.__cache__ = {};
Module['b2BodyDef'] = b2BodyDef;

  b2BodyDef.prototype['get_type'] = b2BodyDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_type_0(self);
};
    b2BodyDef.prototype['set_type'] = b2BodyDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_type_1(self, arg0);
};
  b2BodyDef.prototype['get_position'] = b2BodyDef.prototype.get_position = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2BodyDef_get_position_0(self), b2Vec2);
};
    b2BodyDef.prototype['set_position'] = b2BodyDef.prototype.set_position = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_position_1(self, arg0);
};
  b2BodyDef.prototype['get_angle'] = b2BodyDef.prototype.get_angle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_angle_0(self);
};
    b2BodyDef.prototype['set_angle'] = b2BodyDef.prototype.set_angle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_angle_1(self, arg0);
};
  b2BodyDef.prototype['get_linearVelocity'] = b2BodyDef.prototype.get_linearVelocity = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2BodyDef_get_linearVelocity_0(self), b2Vec2);
};
    b2BodyDef.prototype['set_linearVelocity'] = b2BodyDef.prototype.set_linearVelocity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_linearVelocity_1(self, arg0);
};
  b2BodyDef.prototype['get_angularVelocity'] = b2BodyDef.prototype.get_angularVelocity = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_angularVelocity_0(self);
};
    b2BodyDef.prototype['set_angularVelocity'] = b2BodyDef.prototype.set_angularVelocity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_angularVelocity_1(self, arg0);
};
  b2BodyDef.prototype['get_linearDamping'] = b2BodyDef.prototype.get_linearDamping = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_linearDamping_0(self);
};
    b2BodyDef.prototype['set_linearDamping'] = b2BodyDef.prototype.set_linearDamping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_linearDamping_1(self, arg0);
};
  b2BodyDef.prototype['get_angularDamping'] = b2BodyDef.prototype.get_angularDamping = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_angularDamping_0(self);
};
    b2BodyDef.prototype['set_angularDamping'] = b2BodyDef.prototype.set_angularDamping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_angularDamping_1(self, arg0);
};
  b2BodyDef.prototype['get_allowSleep'] = b2BodyDef.prototype.get_allowSleep = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2BodyDef_get_allowSleep_0(self));
};
    b2BodyDef.prototype['set_allowSleep'] = b2BodyDef.prototype.set_allowSleep = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_allowSleep_1(self, arg0);
};
  b2BodyDef.prototype['get_awake'] = b2BodyDef.prototype.get_awake = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2BodyDef_get_awake_0(self));
};
    b2BodyDef.prototype['set_awake'] = b2BodyDef.prototype.set_awake = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_awake_1(self, arg0);
};
  b2BodyDef.prototype['get_fixedRotation'] = b2BodyDef.prototype.get_fixedRotation = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2BodyDef_get_fixedRotation_0(self));
};
    b2BodyDef.prototype['set_fixedRotation'] = b2BodyDef.prototype.set_fixedRotation = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_fixedRotation_1(self, arg0);
};
  b2BodyDef.prototype['get_bullet'] = b2BodyDef.prototype.get_bullet = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2BodyDef_get_bullet_0(self));
};
    b2BodyDef.prototype['set_bullet'] = b2BodyDef.prototype.set_bullet = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_bullet_1(self, arg0);
};
  b2BodyDef.prototype['get_active'] = b2BodyDef.prototype.get_active = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2BodyDef_get_active_0(self));
};
    b2BodyDef.prototype['set_active'] = b2BodyDef.prototype.set_active = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_active_1(self, arg0);
};
  b2BodyDef.prototype['get_userData'] = b2BodyDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_userData_0(self);
};
    b2BodyDef.prototype['set_userData'] = b2BodyDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_userData_1(self, arg0);
};
  b2BodyDef.prototype['get_gravityScale'] = b2BodyDef.prototype.get_gravityScale = function() {
  var self = this.ptr;
  return _emscripten_bind_b2BodyDef_get_gravityScale_0(self);
};
    b2BodyDef.prototype['set_gravityScale'] = b2BodyDef.prototype.set_gravityScale = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2BodyDef_set_gravityScale_1(self, arg0);
};
  b2BodyDef.prototype['__destroy__'] = b2BodyDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2BodyDef___destroy___0(self);
};
// JSRayCastCallback
function JSRayCastCallback() {
  this.ptr = _emscripten_bind_JSRayCastCallback_JSRayCastCallback_0();
  getCache(JSRayCastCallback)[this.ptr] = this;
};;
JSRayCastCallback.prototype = Object.create(b2RayCastCallback.prototype);
JSRayCastCallback.prototype.constructor = JSRayCastCallback;
JSRayCastCallback.prototype.__class__ = JSRayCastCallback;
JSRayCastCallback.__cache__ = {};
Module['JSRayCastCallback'] = JSRayCastCallback;

JSRayCastCallback.prototype['ReportFixture'] = JSRayCastCallback.prototype.ReportFixture = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return _emscripten_bind_JSRayCastCallback_ReportFixture_4(self, arg0, arg1, arg2, arg3);
};;

  JSRayCastCallback.prototype['__destroy__'] = JSRayCastCallback.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSRayCastCallback___destroy___0(self);
};
// b2ContactFeature
function b2ContactFeature() { throw "cannot construct a b2ContactFeature, no constructor in IDL" }
b2ContactFeature.prototype = Object.create(WrapperObject.prototype);
b2ContactFeature.prototype.constructor = b2ContactFeature;
b2ContactFeature.prototype.__class__ = b2ContactFeature;
b2ContactFeature.__cache__ = {};
Module['b2ContactFeature'] = b2ContactFeature;

  b2ContactFeature.prototype['get_indexA'] = b2ContactFeature.prototype.get_indexA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactFeature_get_indexA_0(self);
};
    b2ContactFeature.prototype['set_indexA'] = b2ContactFeature.prototype.set_indexA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactFeature_set_indexA_1(self, arg0);
};
  b2ContactFeature.prototype['get_indexB'] = b2ContactFeature.prototype.get_indexB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactFeature_get_indexB_0(self);
};
    b2ContactFeature.prototype['set_indexB'] = b2ContactFeature.prototype.set_indexB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactFeature_set_indexB_1(self, arg0);
};
  b2ContactFeature.prototype['get_typeA'] = b2ContactFeature.prototype.get_typeA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactFeature_get_typeA_0(self);
};
    b2ContactFeature.prototype['set_typeA'] = b2ContactFeature.prototype.set_typeA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactFeature_set_typeA_1(self, arg0);
};
  b2ContactFeature.prototype['get_typeB'] = b2ContactFeature.prototype.get_typeB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactFeature_get_typeB_0(self);
};
    b2ContactFeature.prototype['set_typeB'] = b2ContactFeature.prototype.set_typeB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactFeature_set_typeB_1(self, arg0);
};
  b2ContactFeature.prototype['__destroy__'] = b2ContactFeature.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactFeature___destroy___0(self);
};
// b2Vec2
function b2Vec2(arg0, arg1) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Vec2_b2Vec2_0(); getCache(b2Vec2)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Vec2_b2Vec2_1(arg0); getCache(b2Vec2)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Vec2_b2Vec2_2(arg0, arg1);
  getCache(b2Vec2)[this.ptr] = this;
};;
b2Vec2.prototype = Object.create(WrapperObject.prototype);
b2Vec2.prototype.constructor = b2Vec2;
b2Vec2.prototype.__class__ = b2Vec2;
b2Vec2.__cache__ = {};
Module['b2Vec2'] = b2Vec2;

b2Vec2.prototype['SetZero'] = b2Vec2.prototype.SetZero = function() {
  var self = this.ptr;
  _emscripten_bind_b2Vec2_SetZero_0(self);
};;

b2Vec2.prototype['Set'] = b2Vec2.prototype.Set = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Vec2_Set_2(self, arg0, arg1);
};;

b2Vec2.prototype['op_add'] = b2Vec2.prototype.op_add = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec2_op_add_1(self, arg0);
};;

b2Vec2.prototype['op_sub'] = b2Vec2.prototype.op_sub = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec2_op_sub_1(self, arg0);
};;

b2Vec2.prototype['op_mul'] = b2Vec2.prototype.op_mul = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec2_op_mul_1(self, arg0);
};;

b2Vec2.prototype['Length'] = b2Vec2.prototype.Length = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec2_Length_0(self);
};;

b2Vec2.prototype['LengthSquared'] = b2Vec2.prototype.LengthSquared = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec2_LengthSquared_0(self);
};;

b2Vec2.prototype['Normalize'] = b2Vec2.prototype.Normalize = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec2_Normalize_0(self);
};;

b2Vec2.prototype['IsValid'] = b2Vec2.prototype.IsValid = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Vec2_IsValid_0(self));
};;

b2Vec2.prototype['Skew'] = b2Vec2.prototype.Skew = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Vec2_Skew_0(self), b2Vec2);
};;

  b2Vec2.prototype['get_x'] = b2Vec2.prototype.get_x = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec2_get_x_0(self);
};
    b2Vec2.prototype['set_x'] = b2Vec2.prototype.set_x = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec2_set_x_1(self, arg0);
};
  b2Vec2.prototype['get_y'] = b2Vec2.prototype.get_y = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec2_get_y_0(self);
};
    b2Vec2.prototype['set_y'] = b2Vec2.prototype.set_y = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec2_set_y_1(self, arg0);
};
  b2Vec2.prototype['__destroy__'] = b2Vec2.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Vec2___destroy___0(self);
};
// b2Vec3
function b2Vec3(arg0, arg1, arg2) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Vec3_b2Vec3_0(); getCache(b2Vec3)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Vec3_b2Vec3_1(arg0); getCache(b2Vec3)[this.ptr] = this;return }
  if (arg2 === undefined) { this.ptr = _emscripten_bind_b2Vec3_b2Vec3_2(arg0, arg1); getCache(b2Vec3)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Vec3_b2Vec3_3(arg0, arg1, arg2);
  getCache(b2Vec3)[this.ptr] = this;
};;
b2Vec3.prototype = Object.create(WrapperObject.prototype);
b2Vec3.prototype.constructor = b2Vec3;
b2Vec3.prototype.__class__ = b2Vec3;
b2Vec3.__cache__ = {};
Module['b2Vec3'] = b2Vec3;

b2Vec3.prototype['SetZero'] = b2Vec3.prototype.SetZero = function() {
  var self = this.ptr;
  _emscripten_bind_b2Vec3_SetZero_0(self);
};;

b2Vec3.prototype['Set'] = b2Vec3.prototype.Set = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2Vec3_Set_3(self, arg0, arg1, arg2);
};;

b2Vec3.prototype['op_add'] = b2Vec3.prototype.op_add = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_op_add_1(self, arg0);
};;

b2Vec3.prototype['op_sub'] = b2Vec3.prototype.op_sub = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_op_sub_1(self, arg0);
};;

b2Vec3.prototype['op_mul'] = b2Vec3.prototype.op_mul = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_op_mul_1(self, arg0);
};;

  b2Vec3.prototype['get_x'] = b2Vec3.prototype.get_x = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec3_get_x_0(self);
};
    b2Vec3.prototype['set_x'] = b2Vec3.prototype.set_x = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_set_x_1(self, arg0);
};
  b2Vec3.prototype['get_y'] = b2Vec3.prototype.get_y = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec3_get_y_0(self);
};
    b2Vec3.prototype['set_y'] = b2Vec3.prototype.set_y = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_set_y_1(self, arg0);
};
  b2Vec3.prototype['get_z'] = b2Vec3.prototype.get_z = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Vec3_get_z_0(self);
};
    b2Vec3.prototype['set_z'] = b2Vec3.prototype.set_z = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Vec3_set_z_1(self, arg0);
};
  b2Vec3.prototype['__destroy__'] = b2Vec3.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Vec3___destroy___0(self);
};
// b2AABB
function b2AABB() {
  this.ptr = _emscripten_bind_b2AABB_b2AABB_0();
  getCache(b2AABB)[this.ptr] = this;
};;
b2AABB.prototype = Object.create(WrapperObject.prototype);
b2AABB.prototype.constructor = b2AABB;
b2AABB.prototype.__class__ = b2AABB;
b2AABB.__cache__ = {};
Module['b2AABB'] = b2AABB;

b2AABB.prototype['IsValid'] = b2AABB.prototype.IsValid = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2AABB_IsValid_0(self));
};;

b2AABB.prototype['GetCenter'] = b2AABB.prototype.GetCenter = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2AABB_GetCenter_0(self), b2Vec2);
};;

b2AABB.prototype['GetExtents'] = b2AABB.prototype.GetExtents = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2AABB_GetExtents_0(self), b2Vec2);
};;

b2AABB.prototype['GetPerimeter'] = b2AABB.prototype.GetPerimeter = function() {
  var self = this.ptr;
  return _emscripten_bind_b2AABB_GetPerimeter_0(self);
};;

b2AABB.prototype['Combine'] = b2AABB.prototype.Combine = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg1 === undefined) { _emscripten_bind_b2AABB_Combine_1(self, arg0);  return }
  _emscripten_bind_b2AABB_Combine_2(self, arg0, arg1);
};;

b2AABB.prototype['Contains'] = b2AABB.prototype.Contains = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return !!(_emscripten_bind_b2AABB_Contains_1(self, arg0));
};;

b2AABB.prototype['RayCast'] = b2AABB.prototype.RayCast = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2AABB_RayCast_2(self, arg0, arg1));
};;

  b2AABB.prototype['get_lowerBound'] = b2AABB.prototype.get_lowerBound = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2AABB_get_lowerBound_0(self), b2Vec2);
};
    b2AABB.prototype['set_lowerBound'] = b2AABB.prototype.set_lowerBound = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2AABB_set_lowerBound_1(self, arg0);
};
  b2AABB.prototype['get_upperBound'] = b2AABB.prototype.get_upperBound = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2AABB_get_upperBound_0(self), b2Vec2);
};
    b2AABB.prototype['set_upperBound'] = b2AABB.prototype.set_upperBound = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2AABB_set_upperBound_1(self, arg0);
};
  b2AABB.prototype['__destroy__'] = b2AABB.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2AABB___destroy___0(self);
};
// b2FixtureDef
function b2FixtureDef() {
  this.ptr = _emscripten_bind_b2FixtureDef_b2FixtureDef_0();
  getCache(b2FixtureDef)[this.ptr] = this;
};;
b2FixtureDef.prototype = Object.create(WrapperObject.prototype);
b2FixtureDef.prototype.constructor = b2FixtureDef;
b2FixtureDef.prototype.__class__ = b2FixtureDef;
b2FixtureDef.__cache__ = {};
Module['b2FixtureDef'] = b2FixtureDef;

  b2FixtureDef.prototype['get_shape'] = b2FixtureDef.prototype.get_shape = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FixtureDef_get_shape_0(self), b2Shape);
};
    b2FixtureDef.prototype['set_shape'] = b2FixtureDef.prototype.set_shape = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_shape_1(self, arg0);
};
  b2FixtureDef.prototype['get_userData'] = b2FixtureDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FixtureDef_get_userData_0(self);
};
    b2FixtureDef.prototype['set_userData'] = b2FixtureDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_userData_1(self, arg0);
};
  b2FixtureDef.prototype['get_friction'] = b2FixtureDef.prototype.get_friction = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FixtureDef_get_friction_0(self);
};
    b2FixtureDef.prototype['set_friction'] = b2FixtureDef.prototype.set_friction = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_friction_1(self, arg0);
};
  b2FixtureDef.prototype['get_restitution'] = b2FixtureDef.prototype.get_restitution = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FixtureDef_get_restitution_0(self);
};
    b2FixtureDef.prototype['set_restitution'] = b2FixtureDef.prototype.set_restitution = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_restitution_1(self, arg0);
};
  b2FixtureDef.prototype['get_density'] = b2FixtureDef.prototype.get_density = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FixtureDef_get_density_0(self);
};
    b2FixtureDef.prototype['set_density'] = b2FixtureDef.prototype.set_density = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_density_1(self, arg0);
};
  b2FixtureDef.prototype['get_isSensor'] = b2FixtureDef.prototype.get_isSensor = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2FixtureDef_get_isSensor_0(self));
};
    b2FixtureDef.prototype['set_isSensor'] = b2FixtureDef.prototype.set_isSensor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_isSensor_1(self, arg0);
};
  b2FixtureDef.prototype['get_filter'] = b2FixtureDef.prototype.get_filter = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FixtureDef_get_filter_0(self), b2Filter);
};
    b2FixtureDef.prototype['set_filter'] = b2FixtureDef.prototype.set_filter = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FixtureDef_set_filter_1(self, arg0);
};
  b2FixtureDef.prototype['__destroy__'] = b2FixtureDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2FixtureDef___destroy___0(self);
};
// b2FrictionJointDef
function b2FrictionJointDef() {
  this.ptr = _emscripten_bind_b2FrictionJointDef_b2FrictionJointDef_0();
  getCache(b2FrictionJointDef)[this.ptr] = this;
};;
b2FrictionJointDef.prototype = Object.create(b2JointDef.prototype);
b2FrictionJointDef.prototype.constructor = b2FrictionJointDef;
b2FrictionJointDef.prototype.__class__ = b2FrictionJointDef;
b2FrictionJointDef.__cache__ = {};
Module['b2FrictionJointDef'] = b2FrictionJointDef;

b2FrictionJointDef.prototype['Initialize'] = b2FrictionJointDef.prototype.Initialize = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2FrictionJointDef_Initialize_3(self, arg0, arg1, arg2);
};;

  b2FrictionJointDef.prototype['get_localAnchorA'] = b2FrictionJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2FrictionJointDef.prototype['set_localAnchorA'] = b2FrictionJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_localAnchorA_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_localAnchorB'] = b2FrictionJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2FrictionJointDef.prototype['set_localAnchorB'] = b2FrictionJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_localAnchorB_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_maxForce'] = b2FrictionJointDef.prototype.get_maxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJointDef_get_maxForce_0(self);
};
    b2FrictionJointDef.prototype['set_maxForce'] = b2FrictionJointDef.prototype.set_maxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_maxForce_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_maxTorque'] = b2FrictionJointDef.prototype.get_maxTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJointDef_get_maxTorque_0(self);
};
    b2FrictionJointDef.prototype['set_maxTorque'] = b2FrictionJointDef.prototype.set_maxTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_maxTorque_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_type'] = b2FrictionJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJointDef_get_type_0(self);
};
    b2FrictionJointDef.prototype['set_type'] = b2FrictionJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_type_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_userData'] = b2FrictionJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJointDef_get_userData_0(self);
};
    b2FrictionJointDef.prototype['set_userData'] = b2FrictionJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_userData_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_bodyA'] = b2FrictionJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJointDef_get_bodyA_0(self), b2Body);
};
    b2FrictionJointDef.prototype['set_bodyA'] = b2FrictionJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_bodyA_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_bodyB'] = b2FrictionJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJointDef_get_bodyB_0(self), b2Body);
};
    b2FrictionJointDef.prototype['set_bodyB'] = b2FrictionJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_bodyB_1(self, arg0);
};
  b2FrictionJointDef.prototype['get_collideConnected'] = b2FrictionJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2FrictionJointDef_get_collideConnected_0(self));
};
    b2FrictionJointDef.prototype['set_collideConnected'] = b2FrictionJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJointDef_set_collideConnected_1(self, arg0);
};
  b2FrictionJointDef.prototype['__destroy__'] = b2FrictionJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2FrictionJointDef___destroy___0(self);
};
// b2Manifold
function b2Manifold() {
  this.ptr = _emscripten_bind_b2Manifold_b2Manifold_0();
  getCache(b2Manifold)[this.ptr] = this;
};;
b2Manifold.prototype = Object.create(WrapperObject.prototype);
b2Manifold.prototype.constructor = b2Manifold;
b2Manifold.prototype.__class__ = b2Manifold;
b2Manifold.__cache__ = {};
Module['b2Manifold'] = b2Manifold;

  b2Manifold.prototype['get_localNormal'] = b2Manifold.prototype.get_localNormal = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Manifold_get_localNormal_0(self), b2Vec2);
};
    b2Manifold.prototype['set_localNormal'] = b2Manifold.prototype.set_localNormal = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Manifold_set_localNormal_1(self, arg0);
};
  b2Manifold.prototype['get_localPoint'] = b2Manifold.prototype.get_localPoint = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Manifold_get_localPoint_0(self), b2Vec2);
};
    b2Manifold.prototype['set_localPoint'] = b2Manifold.prototype.set_localPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Manifold_set_localPoint_1(self, arg0);
};
  b2Manifold.prototype['get_type'] = b2Manifold.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Manifold_get_type_0(self);
};
    b2Manifold.prototype['set_type'] = b2Manifold.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Manifold_set_type_1(self, arg0);
};
  b2Manifold.prototype['get_pointCount'] = b2Manifold.prototype.get_pointCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Manifold_get_pointCount_0(self);
};
    b2Manifold.prototype['set_pointCount'] = b2Manifold.prototype.set_pointCount = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Manifold_set_pointCount_1(self, arg0);
};
  b2Manifold.prototype['__destroy__'] = b2Manifold.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Manifold___destroy___0(self);
};
// b2PrismaticJointDef
function b2PrismaticJointDef() {
  this.ptr = _emscripten_bind_b2PrismaticJointDef_b2PrismaticJointDef_0();
  getCache(b2PrismaticJointDef)[this.ptr] = this;
};;
b2PrismaticJointDef.prototype = Object.create(b2JointDef.prototype);
b2PrismaticJointDef.prototype.constructor = b2PrismaticJointDef;
b2PrismaticJointDef.prototype.__class__ = b2PrismaticJointDef;
b2PrismaticJointDef.__cache__ = {};
Module['b2PrismaticJointDef'] = b2PrismaticJointDef;

b2PrismaticJointDef.prototype['Initialize'] = b2PrismaticJointDef.prototype.Initialize = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  _emscripten_bind_b2PrismaticJointDef_Initialize_4(self, arg0, arg1, arg2, arg3);
};;

  b2PrismaticJointDef.prototype['get_localAnchorA'] = b2PrismaticJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2PrismaticJointDef.prototype['set_localAnchorA'] = b2PrismaticJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_localAnchorA_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_localAnchorB'] = b2PrismaticJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2PrismaticJointDef.prototype['set_localAnchorB'] = b2PrismaticJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_localAnchorB_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_localAxisA'] = b2PrismaticJointDef.prototype.get_localAxisA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJointDef_get_localAxisA_0(self), b2Vec2);
};
    b2PrismaticJointDef.prototype['set_localAxisA'] = b2PrismaticJointDef.prototype.set_localAxisA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_localAxisA_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_referenceAngle'] = b2PrismaticJointDef.prototype.get_referenceAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_referenceAngle_0(self);
};
    b2PrismaticJointDef.prototype['set_referenceAngle'] = b2PrismaticJointDef.prototype.set_referenceAngle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_referenceAngle_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_enableLimit'] = b2PrismaticJointDef.prototype.get_enableLimit = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJointDef_get_enableLimit_0(self));
};
    b2PrismaticJointDef.prototype['set_enableLimit'] = b2PrismaticJointDef.prototype.set_enableLimit = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_enableLimit_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_lowerTranslation'] = b2PrismaticJointDef.prototype.get_lowerTranslation = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_lowerTranslation_0(self);
};
    b2PrismaticJointDef.prototype['set_lowerTranslation'] = b2PrismaticJointDef.prototype.set_lowerTranslation = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_lowerTranslation_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_upperTranslation'] = b2PrismaticJointDef.prototype.get_upperTranslation = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_upperTranslation_0(self);
};
    b2PrismaticJointDef.prototype['set_upperTranslation'] = b2PrismaticJointDef.prototype.set_upperTranslation = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_upperTranslation_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_enableMotor'] = b2PrismaticJointDef.prototype.get_enableMotor = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJointDef_get_enableMotor_0(self));
};
    b2PrismaticJointDef.prototype['set_enableMotor'] = b2PrismaticJointDef.prototype.set_enableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_enableMotor_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_maxMotorForce'] = b2PrismaticJointDef.prototype.get_maxMotorForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_maxMotorForce_0(self);
};
    b2PrismaticJointDef.prototype['set_maxMotorForce'] = b2PrismaticJointDef.prototype.set_maxMotorForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_maxMotorForce_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_motorSpeed'] = b2PrismaticJointDef.prototype.get_motorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_motorSpeed_0(self);
};
    b2PrismaticJointDef.prototype['set_motorSpeed'] = b2PrismaticJointDef.prototype.set_motorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_motorSpeed_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_type'] = b2PrismaticJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_type_0(self);
};
    b2PrismaticJointDef.prototype['set_type'] = b2PrismaticJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_type_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_userData'] = b2PrismaticJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJointDef_get_userData_0(self);
};
    b2PrismaticJointDef.prototype['set_userData'] = b2PrismaticJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_userData_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_bodyA'] = b2PrismaticJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJointDef_get_bodyA_0(self), b2Body);
};
    b2PrismaticJointDef.prototype['set_bodyA'] = b2PrismaticJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_bodyA_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_bodyB'] = b2PrismaticJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJointDef_get_bodyB_0(self), b2Body);
};
    b2PrismaticJointDef.prototype['set_bodyB'] = b2PrismaticJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_bodyB_1(self, arg0);
};
  b2PrismaticJointDef.prototype['get_collideConnected'] = b2PrismaticJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJointDef_get_collideConnected_0(self));
};
    b2PrismaticJointDef.prototype['set_collideConnected'] = b2PrismaticJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJointDef_set_collideConnected_1(self, arg0);
};
  b2PrismaticJointDef.prototype['__destroy__'] = b2PrismaticJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2PrismaticJointDef___destroy___0(self);
};
// b2World
function b2World(arg0) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  this.ptr = _emscripten_bind_b2World_b2World_1(arg0);
  getCache(b2World)[this.ptr] = this;
};;
b2World.prototype = Object.create(WrapperObject.prototype);
b2World.prototype.constructor = b2World;
b2World.prototype.__class__ = b2World;
b2World.__cache__ = {};
Module['b2World'] = b2World;

b2World.prototype['SetDestructionListener'] = b2World.prototype.SetDestructionListener = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetDestructionListener_1(self, arg0);
};;

b2World.prototype['SetContactFilter'] = b2World.prototype.SetContactFilter = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetContactFilter_1(self, arg0);
};;

b2World.prototype['SetContactListener'] = b2World.prototype.SetContactListener = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetContactListener_1(self, arg0);
};;

b2World.prototype['SetDebugDraw'] = b2World.prototype.SetDebugDraw = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetDebugDraw_1(self, arg0);
};;

b2World.prototype['CreateBody'] = b2World.prototype.CreateBody = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2World_CreateBody_1(self, arg0), b2Body);
};;

b2World.prototype['DestroyBody'] = b2World.prototype.DestroyBody = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_DestroyBody_1(self, arg0);
};;

b2World.prototype['CreateJoint'] = b2World.prototype.CreateJoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2World_CreateJoint_1(self, arg0), b2Joint);
};;

b2World.prototype['DestroyJoint'] = b2World.prototype.DestroyJoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_DestroyJoint_1(self, arg0);
};;

b2World.prototype['Step'] = b2World.prototype.Step = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2World_Step_3(self, arg0, arg1, arg2);
};;

b2World.prototype['ClearForces'] = b2World.prototype.ClearForces = function() {
  var self = this.ptr;
  _emscripten_bind_b2World_ClearForces_0(self);
};;

b2World.prototype['DrawDebugData'] = b2World.prototype.DrawDebugData = function() {
  var self = this.ptr;
  _emscripten_bind_b2World_DrawDebugData_0(self);
};;

b2World.prototype['QueryAABB'] = b2World.prototype.QueryAABB = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2World_QueryAABB_2(self, arg0, arg1);
};;

b2World.prototype['RayCast'] = b2World.prototype.RayCast = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2World_RayCast_3(self, arg0, arg1, arg2);
};;

b2World.prototype['GetBodyList'] = b2World.prototype.GetBodyList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2World_GetBodyList_0(self), b2Body);
};;

b2World.prototype['GetJointList'] = b2World.prototype.GetJointList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2World_GetJointList_0(self), b2Joint);
};;

b2World.prototype['GetContactList'] = b2World.prototype.GetContactList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2World_GetContactList_0(self), b2Contact);
};;

b2World.prototype['SetAllowSleeping'] = b2World.prototype.SetAllowSleeping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetAllowSleeping_1(self, arg0);
};;

b2World.prototype['GetAllowSleeping'] = b2World.prototype.GetAllowSleeping = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_GetAllowSleeping_0(self));
};;

b2World.prototype['SetWarmStarting'] = b2World.prototype.SetWarmStarting = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetWarmStarting_1(self, arg0);
};;

b2World.prototype['GetWarmStarting'] = b2World.prototype.GetWarmStarting = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_GetWarmStarting_0(self));
};;

b2World.prototype['SetContinuousPhysics'] = b2World.prototype.SetContinuousPhysics = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetContinuousPhysics_1(self, arg0);
};;

b2World.prototype['GetContinuousPhysics'] = b2World.prototype.GetContinuousPhysics = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_GetContinuousPhysics_0(self));
};;

b2World.prototype['SetSubStepping'] = b2World.prototype.SetSubStepping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetSubStepping_1(self, arg0);
};;

b2World.prototype['GetSubStepping'] = b2World.prototype.GetSubStepping = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_GetSubStepping_0(self));
};;

b2World.prototype['GetProxyCount'] = b2World.prototype.GetProxyCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetProxyCount_0(self);
};;

b2World.prototype['GetBodyCount'] = b2World.prototype.GetBodyCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetBodyCount_0(self);
};;

b2World.prototype['GetJointCount'] = b2World.prototype.GetJointCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetJointCount_0(self);
};;

b2World.prototype['GetContactCount'] = b2World.prototype.GetContactCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetContactCount_0(self);
};;

b2World.prototype['GetTreeHeight'] = b2World.prototype.GetTreeHeight = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetTreeHeight_0(self);
};;

b2World.prototype['GetTreeBalance'] = b2World.prototype.GetTreeBalance = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetTreeBalance_0(self);
};;

b2World.prototype['GetTreeQuality'] = b2World.prototype.GetTreeQuality = function() {
  var self = this.ptr;
  return _emscripten_bind_b2World_GetTreeQuality_0(self);
};;

b2World.prototype['SetGravity'] = b2World.prototype.SetGravity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetGravity_1(self, arg0);
};;

b2World.prototype['GetGravity'] = b2World.prototype.GetGravity = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2World_GetGravity_0(self), b2Vec2);
};;

b2World.prototype['IsLocked'] = b2World.prototype.IsLocked = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_IsLocked_0(self));
};;

b2World.prototype['SetAutoClearForces'] = b2World.prototype.SetAutoClearForces = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2World_SetAutoClearForces_1(self, arg0);
};;

b2World.prototype['GetAutoClearForces'] = b2World.prototype.GetAutoClearForces = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2World_GetAutoClearForces_0(self));
};;

b2World.prototype['GetProfile'] = b2World.prototype.GetProfile = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2World_GetProfile_0(self), b2Profile);
};;

b2World.prototype['Dump'] = b2World.prototype.Dump = function() {
  var self = this.ptr;
  _emscripten_bind_b2World_Dump_0(self);
};;

  b2World.prototype['__destroy__'] = b2World.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2World___destroy___0(self);
};
// b2PrismaticJoint
function b2PrismaticJoint() { throw "cannot construct a b2PrismaticJoint, no constructor in IDL" }
b2PrismaticJoint.prototype = Object.create(b2Joint.prototype);
b2PrismaticJoint.prototype.constructor = b2PrismaticJoint;
b2PrismaticJoint.prototype.__class__ = b2PrismaticJoint;
b2PrismaticJoint.__cache__ = {};
Module['b2PrismaticJoint'] = b2PrismaticJoint;

b2PrismaticJoint.prototype['GetLocalAnchorA'] = b2PrismaticJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2PrismaticJoint.prototype['GetLocalAnchorB'] = b2PrismaticJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2PrismaticJoint.prototype['GetLocalAxisA'] = b2PrismaticJoint.prototype.GetLocalAxisA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetLocalAxisA_0(self), b2Vec2);
};;

b2PrismaticJoint.prototype['GetReferenceAngle'] = b2PrismaticJoint.prototype.GetReferenceAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetReferenceAngle_0(self);
};;

b2PrismaticJoint.prototype['GetJointTranslation'] = b2PrismaticJoint.prototype.GetJointTranslation = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetJointTranslation_0(self);
};;

b2PrismaticJoint.prototype['GetJointSpeed'] = b2PrismaticJoint.prototype.GetJointSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetJointSpeed_0(self);
};;

b2PrismaticJoint.prototype['IsLimitEnabled'] = b2PrismaticJoint.prototype.IsLimitEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJoint_IsLimitEnabled_0(self));
};;

b2PrismaticJoint.prototype['EnableLimit'] = b2PrismaticJoint.prototype.EnableLimit = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJoint_EnableLimit_1(self, arg0);
};;

b2PrismaticJoint.prototype['GetLowerLimit'] = b2PrismaticJoint.prototype.GetLowerLimit = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetLowerLimit_0(self);
};;

b2PrismaticJoint.prototype['GetUpperLimit'] = b2PrismaticJoint.prototype.GetUpperLimit = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetUpperLimit_0(self);
};;

b2PrismaticJoint.prototype['SetLimits'] = b2PrismaticJoint.prototype.SetLimits = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2PrismaticJoint_SetLimits_2(self, arg0, arg1);
};;

b2PrismaticJoint.prototype['IsMotorEnabled'] = b2PrismaticJoint.prototype.IsMotorEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJoint_IsMotorEnabled_0(self));
};;

b2PrismaticJoint.prototype['EnableMotor'] = b2PrismaticJoint.prototype.EnableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJoint_EnableMotor_1(self, arg0);
};;

b2PrismaticJoint.prototype['SetMotorSpeed'] = b2PrismaticJoint.prototype.SetMotorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJoint_SetMotorSpeed_1(self, arg0);
};;

b2PrismaticJoint.prototype['GetMotorSpeed'] = b2PrismaticJoint.prototype.GetMotorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetMotorSpeed_0(self);
};;

b2PrismaticJoint.prototype['SetMaxMotorForce'] = b2PrismaticJoint.prototype.SetMaxMotorForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJoint_SetMaxMotorForce_1(self, arg0);
};;

b2PrismaticJoint.prototype['GetMaxMotorForce'] = b2PrismaticJoint.prototype.GetMaxMotorForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetMaxMotorForce_0(self);
};;

b2PrismaticJoint.prototype['GetMotorForce'] = b2PrismaticJoint.prototype.GetMotorForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetMotorForce_1(self, arg0);
};;

b2PrismaticJoint.prototype['GetType'] = b2PrismaticJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetType_0(self);
};;

b2PrismaticJoint.prototype['GetBodyA'] = b2PrismaticJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetBodyA_0(self), b2Body);
};;

b2PrismaticJoint.prototype['GetBodyB'] = b2PrismaticJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetBodyB_0(self), b2Body);
};;

b2PrismaticJoint.prototype['GetAnchorA'] = b2PrismaticJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetAnchorA_0(self), b2Vec2);
};;

b2PrismaticJoint.prototype['GetAnchorB'] = b2PrismaticJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetAnchorB_0(self), b2Vec2);
};;

b2PrismaticJoint.prototype['GetReactionForce'] = b2PrismaticJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2PrismaticJoint.prototype['GetReactionTorque'] = b2PrismaticJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetReactionTorque_1(self, arg0);
};;

b2PrismaticJoint.prototype['GetNext'] = b2PrismaticJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PrismaticJoint_GetNext_0(self), b2Joint);
};;

b2PrismaticJoint.prototype['GetUserData'] = b2PrismaticJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PrismaticJoint_GetUserData_0(self);
};;

b2PrismaticJoint.prototype['SetUserData'] = b2PrismaticJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PrismaticJoint_SetUserData_1(self, arg0);
};;

b2PrismaticJoint.prototype['IsActive'] = b2PrismaticJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJoint_IsActive_0(self));
};;

b2PrismaticJoint.prototype['GetCollideConnected'] = b2PrismaticJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PrismaticJoint_GetCollideConnected_0(self));
};;

  b2PrismaticJoint.prototype['__destroy__'] = b2PrismaticJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2PrismaticJoint___destroy___0(self);
};
// b2RayCastOutput
function b2RayCastOutput() { throw "cannot construct a b2RayCastOutput, no constructor in IDL" }
b2RayCastOutput.prototype = Object.create(WrapperObject.prototype);
b2RayCastOutput.prototype.constructor = b2RayCastOutput;
b2RayCastOutput.prototype.__class__ = b2RayCastOutput;
b2RayCastOutput.__cache__ = {};
Module['b2RayCastOutput'] = b2RayCastOutput;

  b2RayCastOutput.prototype['get_normal'] = b2RayCastOutput.prototype.get_normal = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RayCastOutput_get_normal_0(self), b2Vec2);
};
    b2RayCastOutput.prototype['set_normal'] = b2RayCastOutput.prototype.set_normal = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RayCastOutput_set_normal_1(self, arg0);
};
  b2RayCastOutput.prototype['get_fraction'] = b2RayCastOutput.prototype.get_fraction = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RayCastOutput_get_fraction_0(self);
};
    b2RayCastOutput.prototype['set_fraction'] = b2RayCastOutput.prototype.set_fraction = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RayCastOutput_set_fraction_1(self, arg0);
};
  b2RayCastOutput.prototype['__destroy__'] = b2RayCastOutput.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RayCastOutput___destroy___0(self);
};
// b2ContactID
function b2ContactID() { throw "cannot construct a b2ContactID, no constructor in IDL" }
b2ContactID.prototype = Object.create(WrapperObject.prototype);
b2ContactID.prototype.constructor = b2ContactID;
b2ContactID.prototype.__class__ = b2ContactID;
b2ContactID.__cache__ = {};
Module['b2ContactID'] = b2ContactID;

  b2ContactID.prototype['get_cf'] = b2ContactID.prototype.get_cf = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ContactID_get_cf_0(self), b2ContactFeature);
};
    b2ContactID.prototype['set_cf'] = b2ContactID.prototype.set_cf = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactID_set_cf_1(self, arg0);
};
  b2ContactID.prototype['get_key'] = b2ContactID.prototype.get_key = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ContactID_get_key_0(self);
};
    b2ContactID.prototype['set_key'] = b2ContactID.prototype.set_key = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactID_set_key_1(self, arg0);
};
  b2ContactID.prototype['__destroy__'] = b2ContactID.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactID___destroy___0(self);
};
// JSContactListener
function JSContactListener() {
  this.ptr = _emscripten_bind_JSContactListener_JSContactListener_0();
  getCache(JSContactListener)[this.ptr] = this;
};;
JSContactListener.prototype = Object.create(b2ContactListener.prototype);
JSContactListener.prototype.constructor = JSContactListener;
JSContactListener.prototype.__class__ = JSContactListener;
JSContactListener.__cache__ = {};
Module['JSContactListener'] = JSContactListener;

JSContactListener.prototype['BeginContact'] = JSContactListener.prototype.BeginContact = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_JSContactListener_BeginContact_1(self, arg0);
};;

JSContactListener.prototype['EndContact'] = JSContactListener.prototype.EndContact = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_JSContactListener_EndContact_1(self, arg0);
};;

JSContactListener.prototype['PreSolve'] = JSContactListener.prototype.PreSolve = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_JSContactListener_PreSolve_2(self, arg0, arg1);
};;

JSContactListener.prototype['PostSolve'] = JSContactListener.prototype.PostSolve = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_JSContactListener_PostSolve_2(self, arg0, arg1);
};;

  JSContactListener.prototype['__destroy__'] = JSContactListener.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSContactListener___destroy___0(self);
};
// b2Mat22
function b2Mat22(arg0, arg1, arg2, arg3) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Mat22_b2Mat22_0(); getCache(b2Mat22)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Mat22_b2Mat22_1(arg0); getCache(b2Mat22)[this.ptr] = this;return }
  if (arg2 === undefined) { this.ptr = _emscripten_bind_b2Mat22_b2Mat22_2(arg0, arg1); getCache(b2Mat22)[this.ptr] = this;return }
  if (arg3 === undefined) { this.ptr = _emscripten_bind_b2Mat22_b2Mat22_3(arg0, arg1, arg2); getCache(b2Mat22)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Mat22_b2Mat22_4(arg0, arg1, arg2, arg3);
  getCache(b2Mat22)[this.ptr] = this;
};;
b2Mat22.prototype = Object.create(WrapperObject.prototype);
b2Mat22.prototype.constructor = b2Mat22;
b2Mat22.prototype.__class__ = b2Mat22;
b2Mat22.__cache__ = {};
Module['b2Mat22'] = b2Mat22;

b2Mat22.prototype['Set'] = b2Mat22.prototype.Set = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Mat22_Set_2(self, arg0, arg1);
};;

b2Mat22.prototype['SetIdentity'] = b2Mat22.prototype.SetIdentity = function() {
  var self = this.ptr;
  _emscripten_bind_b2Mat22_SetIdentity_0(self);
};;

b2Mat22.prototype['SetZero'] = b2Mat22.prototype.SetZero = function() {
  var self = this.ptr;
  _emscripten_bind_b2Mat22_SetZero_0(self);
};;

b2Mat22.prototype['GetInverse'] = b2Mat22.prototype.GetInverse = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat22_GetInverse_0(self), b2Mat22);
};;

b2Mat22.prototype['Solve'] = b2Mat22.prototype.Solve = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Mat22_Solve_1(self, arg0), b2Vec2);
};;

  b2Mat22.prototype['get_ex'] = b2Mat22.prototype.get_ex = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat22_get_ex_0(self), b2Vec2);
};
    b2Mat22.prototype['set_ex'] = b2Mat22.prototype.set_ex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat22_set_ex_1(self, arg0);
};
  b2Mat22.prototype['get_ey'] = b2Mat22.prototype.get_ey = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Mat22_get_ey_0(self), b2Vec2);
};
    b2Mat22.prototype['set_ey'] = b2Mat22.prototype.set_ey = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Mat22_set_ey_1(self, arg0);
};
  b2Mat22.prototype['__destroy__'] = b2Mat22.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Mat22___destroy___0(self);
};
// b2WheelJointDef
function b2WheelJointDef() {
  this.ptr = _emscripten_bind_b2WheelJointDef_b2WheelJointDef_0();
  getCache(b2WheelJointDef)[this.ptr] = this;
};;
b2WheelJointDef.prototype = Object.create(b2JointDef.prototype);
b2WheelJointDef.prototype.constructor = b2WheelJointDef;
b2WheelJointDef.prototype.__class__ = b2WheelJointDef;
b2WheelJointDef.__cache__ = {};
Module['b2WheelJointDef'] = b2WheelJointDef;

b2WheelJointDef.prototype['Initialize'] = b2WheelJointDef.prototype.Initialize = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  _emscripten_bind_b2WheelJointDef_Initialize_4(self, arg0, arg1, arg2, arg3);
};;

  b2WheelJointDef.prototype['get_localAnchorA'] = b2WheelJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2WheelJointDef.prototype['set_localAnchorA'] = b2WheelJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_localAnchorA_1(self, arg0);
};
  b2WheelJointDef.prototype['get_localAnchorB'] = b2WheelJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2WheelJointDef.prototype['set_localAnchorB'] = b2WheelJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_localAnchorB_1(self, arg0);
};
  b2WheelJointDef.prototype['get_localAxisA'] = b2WheelJointDef.prototype.get_localAxisA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJointDef_get_localAxisA_0(self), b2Vec2);
};
    b2WheelJointDef.prototype['set_localAxisA'] = b2WheelJointDef.prototype.set_localAxisA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_localAxisA_1(self, arg0);
};
  b2WheelJointDef.prototype['get_enableMotor'] = b2WheelJointDef.prototype.get_enableMotor = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WheelJointDef_get_enableMotor_0(self));
};
    b2WheelJointDef.prototype['set_enableMotor'] = b2WheelJointDef.prototype.set_enableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_enableMotor_1(self, arg0);
};
  b2WheelJointDef.prototype['get_maxMotorTorque'] = b2WheelJointDef.prototype.get_maxMotorTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_maxMotorTorque_0(self);
};
    b2WheelJointDef.prototype['set_maxMotorTorque'] = b2WheelJointDef.prototype.set_maxMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_maxMotorTorque_1(self, arg0);
};
  b2WheelJointDef.prototype['get_motorSpeed'] = b2WheelJointDef.prototype.get_motorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_motorSpeed_0(self);
};
    b2WheelJointDef.prototype['set_motorSpeed'] = b2WheelJointDef.prototype.set_motorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_motorSpeed_1(self, arg0);
};
  b2WheelJointDef.prototype['get_frequencyHz'] = b2WheelJointDef.prototype.get_frequencyHz = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_frequencyHz_0(self);
};
    b2WheelJointDef.prototype['set_frequencyHz'] = b2WheelJointDef.prototype.set_frequencyHz = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_frequencyHz_1(self, arg0);
};
  b2WheelJointDef.prototype['get_dampingRatio'] = b2WheelJointDef.prototype.get_dampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_dampingRatio_0(self);
};
    b2WheelJointDef.prototype['set_dampingRatio'] = b2WheelJointDef.prototype.set_dampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_dampingRatio_1(self, arg0);
};
  b2WheelJointDef.prototype['get_type'] = b2WheelJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_type_0(self);
};
    b2WheelJointDef.prototype['set_type'] = b2WheelJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_type_1(self, arg0);
};
  b2WheelJointDef.prototype['get_userData'] = b2WheelJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJointDef_get_userData_0(self);
};
    b2WheelJointDef.prototype['set_userData'] = b2WheelJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_userData_1(self, arg0);
};
  b2WheelJointDef.prototype['get_bodyA'] = b2WheelJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJointDef_get_bodyA_0(self), b2Body);
};
    b2WheelJointDef.prototype['set_bodyA'] = b2WheelJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_bodyA_1(self, arg0);
};
  b2WheelJointDef.prototype['get_bodyB'] = b2WheelJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJointDef_get_bodyB_0(self), b2Body);
};
    b2WheelJointDef.prototype['set_bodyB'] = b2WheelJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_bodyB_1(self, arg0);
};
  b2WheelJointDef.prototype['get_collideConnected'] = b2WheelJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WheelJointDef_get_collideConnected_0(self));
};
    b2WheelJointDef.prototype['set_collideConnected'] = b2WheelJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJointDef_set_collideConnected_1(self, arg0);
};
  b2WheelJointDef.prototype['__destroy__'] = b2WheelJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2WheelJointDef___destroy___0(self);
};
// b2CircleShape
function b2CircleShape() {
  this.ptr = _emscripten_bind_b2CircleShape_b2CircleShape_0();
  getCache(b2CircleShape)[this.ptr] = this;
};;
b2CircleShape.prototype = Object.create(b2Shape.prototype);
b2CircleShape.prototype.constructor = b2CircleShape;
b2CircleShape.prototype.__class__ = b2CircleShape;
b2CircleShape.__cache__ = {};
Module['b2CircleShape'] = b2CircleShape;

b2CircleShape.prototype['GetType'] = b2CircleShape.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2CircleShape_GetType_0(self);
};;

b2CircleShape.prototype['GetChildCount'] = b2CircleShape.prototype.GetChildCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2CircleShape_GetChildCount_0(self);
};;

b2CircleShape.prototype['TestPoint'] = b2CircleShape.prototype.TestPoint = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2CircleShape_TestPoint_2(self, arg0, arg1));
};;

b2CircleShape.prototype['RayCast'] = b2CircleShape.prototype.RayCast = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return !!(_emscripten_bind_b2CircleShape_RayCast_4(self, arg0, arg1, arg2, arg3));
};;

b2CircleShape.prototype['ComputeAABB'] = b2CircleShape.prototype.ComputeAABB = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2CircleShape_ComputeAABB_3(self, arg0, arg1, arg2);
};;

b2CircleShape.prototype['ComputeMass'] = b2CircleShape.prototype.ComputeMass = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2CircleShape_ComputeMass_2(self, arg0, arg1);
};;

  b2CircleShape.prototype['get_m_p'] = b2CircleShape.prototype.get_m_p = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2CircleShape_get_m_p_0(self), b2Vec2);
};
    b2CircleShape.prototype['set_m_p'] = b2CircleShape.prototype.set_m_p = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2CircleShape_set_m_p_1(self, arg0);
};
  b2CircleShape.prototype['get_m_type'] = b2CircleShape.prototype.get_m_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2CircleShape_get_m_type_0(self);
};
    b2CircleShape.prototype['set_m_type'] = b2CircleShape.prototype.set_m_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2CircleShape_set_m_type_1(self, arg0);
};
  b2CircleShape.prototype['get_m_radius'] = b2CircleShape.prototype.get_m_radius = function() {
  var self = this.ptr;
  return _emscripten_bind_b2CircleShape_get_m_radius_0(self);
};
    b2CircleShape.prototype['set_m_radius'] = b2CircleShape.prototype.set_m_radius = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2CircleShape_set_m_radius_1(self, arg0);
};
  b2CircleShape.prototype['__destroy__'] = b2CircleShape.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2CircleShape___destroy___0(self);
};
// b2WeldJointDef
function b2WeldJointDef() {
  this.ptr = _emscripten_bind_b2WeldJointDef_b2WeldJointDef_0();
  getCache(b2WeldJointDef)[this.ptr] = this;
};;
b2WeldJointDef.prototype = Object.create(b2JointDef.prototype);
b2WeldJointDef.prototype.constructor = b2WeldJointDef;
b2WeldJointDef.prototype.__class__ = b2WeldJointDef;
b2WeldJointDef.__cache__ = {};
Module['b2WeldJointDef'] = b2WeldJointDef;

b2WeldJointDef.prototype['Initialize'] = b2WeldJointDef.prototype.Initialize = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2WeldJointDef_Initialize_3(self, arg0, arg1, arg2);
};;

  b2WeldJointDef.prototype['get_localAnchorA'] = b2WeldJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2WeldJointDef.prototype['set_localAnchorA'] = b2WeldJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_localAnchorA_1(self, arg0);
};
  b2WeldJointDef.prototype['get_localAnchorB'] = b2WeldJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2WeldJointDef.prototype['set_localAnchorB'] = b2WeldJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_localAnchorB_1(self, arg0);
};
  b2WeldJointDef.prototype['get_referenceAngle'] = b2WeldJointDef.prototype.get_referenceAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJointDef_get_referenceAngle_0(self);
};
    b2WeldJointDef.prototype['set_referenceAngle'] = b2WeldJointDef.prototype.set_referenceAngle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_referenceAngle_1(self, arg0);
};
  b2WeldJointDef.prototype['get_frequencyHz'] = b2WeldJointDef.prototype.get_frequencyHz = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJointDef_get_frequencyHz_0(self);
};
    b2WeldJointDef.prototype['set_frequencyHz'] = b2WeldJointDef.prototype.set_frequencyHz = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_frequencyHz_1(self, arg0);
};
  b2WeldJointDef.prototype['get_dampingRatio'] = b2WeldJointDef.prototype.get_dampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJointDef_get_dampingRatio_0(self);
};
    b2WeldJointDef.prototype['set_dampingRatio'] = b2WeldJointDef.prototype.set_dampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_dampingRatio_1(self, arg0);
};
  b2WeldJointDef.prototype['get_type'] = b2WeldJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJointDef_get_type_0(self);
};
    b2WeldJointDef.prototype['set_type'] = b2WeldJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_type_1(self, arg0);
};
  b2WeldJointDef.prototype['get_userData'] = b2WeldJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJointDef_get_userData_0(self);
};
    b2WeldJointDef.prototype['set_userData'] = b2WeldJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_userData_1(self, arg0);
};
  b2WeldJointDef.prototype['get_bodyA'] = b2WeldJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJointDef_get_bodyA_0(self), b2Body);
};
    b2WeldJointDef.prototype['set_bodyA'] = b2WeldJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_bodyA_1(self, arg0);
};
  b2WeldJointDef.prototype['get_bodyB'] = b2WeldJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJointDef_get_bodyB_0(self), b2Body);
};
    b2WeldJointDef.prototype['set_bodyB'] = b2WeldJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_bodyB_1(self, arg0);
};
  b2WeldJointDef.prototype['get_collideConnected'] = b2WeldJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WeldJointDef_get_collideConnected_0(self));
};
    b2WeldJointDef.prototype['set_collideConnected'] = b2WeldJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJointDef_set_collideConnected_1(self, arg0);
};
  b2WeldJointDef.prototype['__destroy__'] = b2WeldJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2WeldJointDef___destroy___0(self);
};
// b2MassData
function b2MassData() {
  this.ptr = _emscripten_bind_b2MassData_b2MassData_0();
  getCache(b2MassData)[this.ptr] = this;
};;
b2MassData.prototype = Object.create(WrapperObject.prototype);
b2MassData.prototype.constructor = b2MassData;
b2MassData.prototype.__class__ = b2MassData;
b2MassData.__cache__ = {};
Module['b2MassData'] = b2MassData;

  b2MassData.prototype['get_mass'] = b2MassData.prototype.get_mass = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MassData_get_mass_0(self);
};
    b2MassData.prototype['set_mass'] = b2MassData.prototype.set_mass = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MassData_set_mass_1(self, arg0);
};
  b2MassData.prototype['get_center'] = b2MassData.prototype.get_center = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MassData_get_center_0(self), b2Vec2);
};
    b2MassData.prototype['set_center'] = b2MassData.prototype.set_center = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MassData_set_center_1(self, arg0);
};
  b2MassData.prototype['get_I'] = b2MassData.prototype.get_I = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MassData_get_I_0(self);
};
    b2MassData.prototype['set_I'] = b2MassData.prototype.set_I = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MassData_set_I_1(self, arg0);
};
  b2MassData.prototype['__destroy__'] = b2MassData.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2MassData___destroy___0(self);
};
// b2GearJoint
function b2GearJoint() { throw "cannot construct a b2GearJoint, no constructor in IDL" }
b2GearJoint.prototype = Object.create(b2Joint.prototype);
b2GearJoint.prototype.constructor = b2GearJoint;
b2GearJoint.prototype.__class__ = b2GearJoint;
b2GearJoint.__cache__ = {};
Module['b2GearJoint'] = b2GearJoint;

b2GearJoint.prototype['GetJoint1'] = b2GearJoint.prototype.GetJoint1 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetJoint1_0(self), b2Joint);
};;

b2GearJoint.prototype['GetJoint2'] = b2GearJoint.prototype.GetJoint2 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetJoint2_0(self), b2Joint);
};;

b2GearJoint.prototype['SetRatio'] = b2GearJoint.prototype.SetRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJoint_SetRatio_1(self, arg0);
};;

b2GearJoint.prototype['GetRatio'] = b2GearJoint.prototype.GetRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJoint_GetRatio_0(self);
};;

b2GearJoint.prototype['GetType'] = b2GearJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJoint_GetType_0(self);
};;

b2GearJoint.prototype['GetBodyA'] = b2GearJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetBodyA_0(self), b2Body);
};;

b2GearJoint.prototype['GetBodyB'] = b2GearJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetBodyB_0(self), b2Body);
};;

b2GearJoint.prototype['GetAnchorA'] = b2GearJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetAnchorA_0(self), b2Vec2);
};;

b2GearJoint.prototype['GetAnchorB'] = b2GearJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetAnchorB_0(self), b2Vec2);
};;

b2GearJoint.prototype['GetReactionForce'] = b2GearJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2GearJoint.prototype['GetReactionTorque'] = b2GearJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2GearJoint_GetReactionTorque_1(self, arg0);
};;

b2GearJoint.prototype['GetNext'] = b2GearJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJoint_GetNext_0(self), b2Joint);
};;

b2GearJoint.prototype['GetUserData'] = b2GearJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJoint_GetUserData_0(self);
};;

b2GearJoint.prototype['SetUserData'] = b2GearJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJoint_SetUserData_1(self, arg0);
};;

b2GearJoint.prototype['IsActive'] = b2GearJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2GearJoint_IsActive_0(self));
};;

b2GearJoint.prototype['GetCollideConnected'] = b2GearJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2GearJoint_GetCollideConnected_0(self));
};;

  b2GearJoint.prototype['__destroy__'] = b2GearJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2GearJoint___destroy___0(self);
};
// b2WeldJoint
function b2WeldJoint() { throw "cannot construct a b2WeldJoint, no constructor in IDL" }
b2WeldJoint.prototype = Object.create(b2Joint.prototype);
b2WeldJoint.prototype.constructor = b2WeldJoint;
b2WeldJoint.prototype.__class__ = b2WeldJoint;
b2WeldJoint.__cache__ = {};
Module['b2WeldJoint'] = b2WeldJoint;

b2WeldJoint.prototype['GetLocalAnchorA'] = b2WeldJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2WeldJoint.prototype['GetLocalAnchorB'] = b2WeldJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2WeldJoint.prototype['SetFrequency'] = b2WeldJoint.prototype.SetFrequency = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJoint_SetFrequency_1(self, arg0);
};;

b2WeldJoint.prototype['GetFrequency'] = b2WeldJoint.prototype.GetFrequency = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJoint_GetFrequency_0(self);
};;

b2WeldJoint.prototype['SetDampingRatio'] = b2WeldJoint.prototype.SetDampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJoint_SetDampingRatio_1(self, arg0);
};;

b2WeldJoint.prototype['GetDampingRatio'] = b2WeldJoint.prototype.GetDampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJoint_GetDampingRatio_0(self);
};;

b2WeldJoint.prototype['Dump'] = b2WeldJoint.prototype.Dump = function() {
  var self = this.ptr;
  _emscripten_bind_b2WeldJoint_Dump_0(self);
};;

b2WeldJoint.prototype['GetType'] = b2WeldJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJoint_GetType_0(self);
};;

b2WeldJoint.prototype['GetBodyA'] = b2WeldJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetBodyA_0(self), b2Body);
};;

b2WeldJoint.prototype['GetBodyB'] = b2WeldJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetBodyB_0(self), b2Body);
};;

b2WeldJoint.prototype['GetAnchorA'] = b2WeldJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetAnchorA_0(self), b2Vec2);
};;

b2WeldJoint.prototype['GetAnchorB'] = b2WeldJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetAnchorB_0(self), b2Vec2);
};;

b2WeldJoint.prototype['GetReactionForce'] = b2WeldJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2WeldJoint.prototype['GetReactionTorque'] = b2WeldJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2WeldJoint_GetReactionTorque_1(self, arg0);
};;

b2WeldJoint.prototype['GetNext'] = b2WeldJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WeldJoint_GetNext_0(self), b2Joint);
};;

b2WeldJoint.prototype['GetUserData'] = b2WeldJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WeldJoint_GetUserData_0(self);
};;

b2WeldJoint.prototype['SetUserData'] = b2WeldJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WeldJoint_SetUserData_1(self, arg0);
};;

b2WeldJoint.prototype['IsActive'] = b2WeldJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WeldJoint_IsActive_0(self));
};;

b2WeldJoint.prototype['GetCollideConnected'] = b2WeldJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WeldJoint_GetCollideConnected_0(self));
};;

  b2WeldJoint.prototype['__destroy__'] = b2WeldJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2WeldJoint___destroy___0(self);
};
// b2JointEdge
function b2JointEdge() {
  this.ptr = _emscripten_bind_b2JointEdge_b2JointEdge_0();
  getCache(b2JointEdge)[this.ptr] = this;
};;
b2JointEdge.prototype = Object.create(WrapperObject.prototype);
b2JointEdge.prototype.constructor = b2JointEdge;
b2JointEdge.prototype.__class__ = b2JointEdge;
b2JointEdge.__cache__ = {};
Module['b2JointEdge'] = b2JointEdge;

  b2JointEdge.prototype['get_other'] = b2JointEdge.prototype.get_other = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointEdge_get_other_0(self), b2Body);
};
    b2JointEdge.prototype['set_other'] = b2JointEdge.prototype.set_other = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointEdge_set_other_1(self, arg0);
};
  b2JointEdge.prototype['get_joint'] = b2JointEdge.prototype.get_joint = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointEdge_get_joint_0(self), b2Joint);
};
    b2JointEdge.prototype['set_joint'] = b2JointEdge.prototype.set_joint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointEdge_set_joint_1(self, arg0);
};
  b2JointEdge.prototype['get_prev'] = b2JointEdge.prototype.get_prev = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointEdge_get_prev_0(self), b2JointEdge);
};
    b2JointEdge.prototype['set_prev'] = b2JointEdge.prototype.set_prev = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointEdge_set_prev_1(self, arg0);
};
  b2JointEdge.prototype['get_next'] = b2JointEdge.prototype.get_next = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2JointEdge_get_next_0(self), b2JointEdge);
};
    b2JointEdge.prototype['set_next'] = b2JointEdge.prototype.set_next = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2JointEdge_set_next_1(self, arg0);
};
  b2JointEdge.prototype['__destroy__'] = b2JointEdge.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2JointEdge___destroy___0(self);
};
// b2PulleyJointDef
function b2PulleyJointDef() {
  this.ptr = _emscripten_bind_b2PulleyJointDef_b2PulleyJointDef_0();
  getCache(b2PulleyJointDef)[this.ptr] = this;
};;
b2PulleyJointDef.prototype = Object.create(b2JointDef.prototype);
b2PulleyJointDef.prototype.constructor = b2PulleyJointDef;
b2PulleyJointDef.prototype.__class__ = b2PulleyJointDef;
b2PulleyJointDef.__cache__ = {};
Module['b2PulleyJointDef'] = b2PulleyJointDef;

b2PulleyJointDef.prototype['Initialize'] = b2PulleyJointDef.prototype.Initialize = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  if (arg4 && typeof arg4 === 'object') arg4 = arg4.ptr;
  if (arg5 && typeof arg5 === 'object') arg5 = arg5.ptr;
  if (arg6 && typeof arg6 === 'object') arg6 = arg6.ptr;
  _emscripten_bind_b2PulleyJointDef_Initialize_7(self, arg0, arg1, arg2, arg3, arg4, arg5, arg6);
};;

  b2PulleyJointDef.prototype['get_groundAnchorA'] = b2PulleyJointDef.prototype.get_groundAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_groundAnchorA_0(self), b2Vec2);
};
    b2PulleyJointDef.prototype['set_groundAnchorA'] = b2PulleyJointDef.prototype.set_groundAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_groundAnchorA_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_groundAnchorB'] = b2PulleyJointDef.prototype.get_groundAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_groundAnchorB_0(self), b2Vec2);
};
    b2PulleyJointDef.prototype['set_groundAnchorB'] = b2PulleyJointDef.prototype.set_groundAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_groundAnchorB_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_localAnchorA'] = b2PulleyJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2PulleyJointDef.prototype['set_localAnchorA'] = b2PulleyJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_localAnchorA_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_localAnchorB'] = b2PulleyJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2PulleyJointDef.prototype['set_localAnchorB'] = b2PulleyJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_localAnchorB_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_lengthA'] = b2PulleyJointDef.prototype.get_lengthA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJointDef_get_lengthA_0(self);
};
    b2PulleyJointDef.prototype['set_lengthA'] = b2PulleyJointDef.prototype.set_lengthA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_lengthA_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_lengthB'] = b2PulleyJointDef.prototype.get_lengthB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJointDef_get_lengthB_0(self);
};
    b2PulleyJointDef.prototype['set_lengthB'] = b2PulleyJointDef.prototype.set_lengthB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_lengthB_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_ratio'] = b2PulleyJointDef.prototype.get_ratio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJointDef_get_ratio_0(self);
};
    b2PulleyJointDef.prototype['set_ratio'] = b2PulleyJointDef.prototype.set_ratio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_ratio_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_type'] = b2PulleyJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJointDef_get_type_0(self);
};
    b2PulleyJointDef.prototype['set_type'] = b2PulleyJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_type_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_userData'] = b2PulleyJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJointDef_get_userData_0(self);
};
    b2PulleyJointDef.prototype['set_userData'] = b2PulleyJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_userData_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_bodyA'] = b2PulleyJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_bodyA_0(self), b2Body);
};
    b2PulleyJointDef.prototype['set_bodyA'] = b2PulleyJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_bodyA_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_bodyB'] = b2PulleyJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJointDef_get_bodyB_0(self), b2Body);
};
    b2PulleyJointDef.prototype['set_bodyB'] = b2PulleyJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_bodyB_1(self, arg0);
};
  b2PulleyJointDef.prototype['get_collideConnected'] = b2PulleyJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PulleyJointDef_get_collideConnected_0(self));
};
    b2PulleyJointDef.prototype['set_collideConnected'] = b2PulleyJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJointDef_set_collideConnected_1(self, arg0);
};
  b2PulleyJointDef.prototype['__destroy__'] = b2PulleyJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2PulleyJointDef___destroy___0(self);
};
// b2ManifoldPoint
function b2ManifoldPoint() {
  this.ptr = _emscripten_bind_b2ManifoldPoint_b2ManifoldPoint_0();
  getCache(b2ManifoldPoint)[this.ptr] = this;
};;
b2ManifoldPoint.prototype = Object.create(WrapperObject.prototype);
b2ManifoldPoint.prototype.constructor = b2ManifoldPoint;
b2ManifoldPoint.prototype.__class__ = b2ManifoldPoint;
b2ManifoldPoint.__cache__ = {};
Module['b2ManifoldPoint'] = b2ManifoldPoint;

  b2ManifoldPoint.prototype['get_localPoint'] = b2ManifoldPoint.prototype.get_localPoint = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ManifoldPoint_get_localPoint_0(self), b2Vec2);
};
    b2ManifoldPoint.prototype['set_localPoint'] = b2ManifoldPoint.prototype.set_localPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ManifoldPoint_set_localPoint_1(self, arg0);
};
  b2ManifoldPoint.prototype['get_normalImpulse'] = b2ManifoldPoint.prototype.get_normalImpulse = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ManifoldPoint_get_normalImpulse_0(self);
};
    b2ManifoldPoint.prototype['set_normalImpulse'] = b2ManifoldPoint.prototype.set_normalImpulse = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ManifoldPoint_set_normalImpulse_1(self, arg0);
};
  b2ManifoldPoint.prototype['get_tangentImpulse'] = b2ManifoldPoint.prototype.get_tangentImpulse = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ManifoldPoint_get_tangentImpulse_0(self);
};
    b2ManifoldPoint.prototype['set_tangentImpulse'] = b2ManifoldPoint.prototype.set_tangentImpulse = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ManifoldPoint_set_tangentImpulse_1(self, arg0);
};
  b2ManifoldPoint.prototype['get_id'] = b2ManifoldPoint.prototype.get_id = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ManifoldPoint_get_id_0(self), b2ContactID);
};
    b2ManifoldPoint.prototype['set_id'] = b2ManifoldPoint.prototype.set_id = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ManifoldPoint_set_id_1(self, arg0);
};
  b2ManifoldPoint.prototype['__destroy__'] = b2ManifoldPoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ManifoldPoint___destroy___0(self);
};
// b2Transform
function b2Transform(arg0, arg1) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Transform_b2Transform_0(); getCache(b2Transform)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Transform_b2Transform_1(arg0); getCache(b2Transform)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Transform_b2Transform_2(arg0, arg1);
  getCache(b2Transform)[this.ptr] = this;
};;
b2Transform.prototype = Object.create(WrapperObject.prototype);
b2Transform.prototype.constructor = b2Transform;
b2Transform.prototype.__class__ = b2Transform;
b2Transform.__cache__ = {};
Module['b2Transform'] = b2Transform;

b2Transform.prototype['SetIdentity'] = b2Transform.prototype.SetIdentity = function() {
  var self = this.ptr;
  _emscripten_bind_b2Transform_SetIdentity_0(self);
};;

b2Transform.prototype['Set'] = b2Transform.prototype.Set = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Transform_Set_2(self, arg0, arg1);
};;

  b2Transform.prototype['get_p'] = b2Transform.prototype.get_p = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Transform_get_p_0(self), b2Vec2);
};
    b2Transform.prototype['set_p'] = b2Transform.prototype.set_p = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Transform_set_p_1(self, arg0);
};
  b2Transform.prototype['get_q'] = b2Transform.prototype.get_q = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Transform_get_q_0(self), b2Rot);
};
    b2Transform.prototype['set_q'] = b2Transform.prototype.set_q = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Transform_set_q_1(self, arg0);
};
  b2Transform.prototype['__destroy__'] = b2Transform.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Transform___destroy___0(self);
};
// b2ChainShape
function b2ChainShape() {
  this.ptr = _emscripten_bind_b2ChainShape_b2ChainShape_0();
  getCache(b2ChainShape)[this.ptr] = this;
};;
b2ChainShape.prototype = Object.create(b2Shape.prototype);
b2ChainShape.prototype.constructor = b2ChainShape;
b2ChainShape.prototype.__class__ = b2ChainShape;
b2ChainShape.__cache__ = {};
Module['b2ChainShape'] = b2ChainShape;

b2ChainShape.prototype['Clear'] = b2ChainShape.prototype.Clear = function() {
  var self = this.ptr;
  _emscripten_bind_b2ChainShape_Clear_0(self);
};;

b2ChainShape.prototype['CreateLoop'] = b2ChainShape.prototype.CreateLoop = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2ChainShape_CreateLoop_2(self, arg0, arg1);
};;

b2ChainShape.prototype['CreateChain'] = b2ChainShape.prototype.CreateChain = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2ChainShape_CreateChain_2(self, arg0, arg1);
};;

b2ChainShape.prototype['SetPrevVertex'] = b2ChainShape.prototype.SetPrevVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_SetPrevVertex_1(self, arg0);
};;

b2ChainShape.prototype['SetNextVertex'] = b2ChainShape.prototype.SetNextVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_SetNextVertex_1(self, arg0);
};;

b2ChainShape.prototype['GetChildEdge'] = b2ChainShape.prototype.GetChildEdge = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2ChainShape_GetChildEdge_2(self, arg0, arg1);
};;

b2ChainShape.prototype['GetType'] = b2ChainShape.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ChainShape_GetType_0(self);
};;

b2ChainShape.prototype['GetChildCount'] = b2ChainShape.prototype.GetChildCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ChainShape_GetChildCount_0(self);
};;

b2ChainShape.prototype['TestPoint'] = b2ChainShape.prototype.TestPoint = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2ChainShape_TestPoint_2(self, arg0, arg1));
};;

b2ChainShape.prototype['RayCast'] = b2ChainShape.prototype.RayCast = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return !!(_emscripten_bind_b2ChainShape_RayCast_4(self, arg0, arg1, arg2, arg3));
};;

b2ChainShape.prototype['ComputeAABB'] = b2ChainShape.prototype.ComputeAABB = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2ChainShape_ComputeAABB_3(self, arg0, arg1, arg2);
};;

b2ChainShape.prototype['ComputeMass'] = b2ChainShape.prototype.ComputeMass = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2ChainShape_ComputeMass_2(self, arg0, arg1);
};;

  b2ChainShape.prototype['get_m_vertices'] = b2ChainShape.prototype.get_m_vertices = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ChainShape_get_m_vertices_0(self), b2Vec2);
};
    b2ChainShape.prototype['set_m_vertices'] = b2ChainShape.prototype.set_m_vertices = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_vertices_1(self, arg0);
};
  b2ChainShape.prototype['get_m_count'] = b2ChainShape.prototype.get_m_count = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ChainShape_get_m_count_0(self);
};
    b2ChainShape.prototype['set_m_count'] = b2ChainShape.prototype.set_m_count = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_count_1(self, arg0);
};
  b2ChainShape.prototype['get_m_prevVertex'] = b2ChainShape.prototype.get_m_prevVertex = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ChainShape_get_m_prevVertex_0(self), b2Vec2);
};
    b2ChainShape.prototype['set_m_prevVertex'] = b2ChainShape.prototype.set_m_prevVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_prevVertex_1(self, arg0);
};
  b2ChainShape.prototype['get_m_nextVertex'] = b2ChainShape.prototype.get_m_nextVertex = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ChainShape_get_m_nextVertex_0(self), b2Vec2);
};
    b2ChainShape.prototype['set_m_nextVertex'] = b2ChainShape.prototype.set_m_nextVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_nextVertex_1(self, arg0);
};
  b2ChainShape.prototype['get_m_hasPrevVertex'] = b2ChainShape.prototype.get_m_hasPrevVertex = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2ChainShape_get_m_hasPrevVertex_0(self));
};
    b2ChainShape.prototype['set_m_hasPrevVertex'] = b2ChainShape.prototype.set_m_hasPrevVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_hasPrevVertex_1(self, arg0);
};
  b2ChainShape.prototype['get_m_hasNextVertex'] = b2ChainShape.prototype.get_m_hasNextVertex = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2ChainShape_get_m_hasNextVertex_0(self));
};
    b2ChainShape.prototype['set_m_hasNextVertex'] = b2ChainShape.prototype.set_m_hasNextVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_hasNextVertex_1(self, arg0);
};
  b2ChainShape.prototype['get_m_type'] = b2ChainShape.prototype.get_m_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ChainShape_get_m_type_0(self);
};
    b2ChainShape.prototype['set_m_type'] = b2ChainShape.prototype.set_m_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_type_1(self, arg0);
};
  b2ChainShape.prototype['get_m_radius'] = b2ChainShape.prototype.get_m_radius = function() {
  var self = this.ptr;
  return _emscripten_bind_b2ChainShape_get_m_radius_0(self);
};
    b2ChainShape.prototype['set_m_radius'] = b2ChainShape.prototype.set_m_radius = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ChainShape_set_m_radius_1(self, arg0);
};
  b2ChainShape.prototype['__destroy__'] = b2ChainShape.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ChainShape___destroy___0(self);
};
// b2Color
function b2Color(arg0, arg1, arg2) {
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg0 === undefined) { this.ptr = _emscripten_bind_b2Color_b2Color_0(); getCache(b2Color)[this.ptr] = this;return }
  if (arg1 === undefined) { this.ptr = _emscripten_bind_b2Color_b2Color_1(arg0); getCache(b2Color)[this.ptr] = this;return }
  if (arg2 === undefined) { this.ptr = _emscripten_bind_b2Color_b2Color_2(arg0, arg1); getCache(b2Color)[this.ptr] = this;return }
  this.ptr = _emscripten_bind_b2Color_b2Color_3(arg0, arg1, arg2);
  getCache(b2Color)[this.ptr] = this;
};;
b2Color.prototype = Object.create(WrapperObject.prototype);
b2Color.prototype.constructor = b2Color;
b2Color.prototype.__class__ = b2Color;
b2Color.__cache__ = {};
Module['b2Color'] = b2Color;

b2Color.prototype['Set'] = b2Color.prototype.Set = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2Color_Set_3(self, arg0, arg1, arg2);
};;

  b2Color.prototype['get_r'] = b2Color.prototype.get_r = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Color_get_r_0(self);
};
    b2Color.prototype['set_r'] = b2Color.prototype.set_r = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Color_set_r_1(self, arg0);
};
  b2Color.prototype['get_g'] = b2Color.prototype.get_g = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Color_get_g_0(self);
};
    b2Color.prototype['set_g'] = b2Color.prototype.set_g = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Color_set_g_1(self, arg0);
};
  b2Color.prototype['get_b'] = b2Color.prototype.get_b = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Color_get_b_0(self);
};
    b2Color.prototype['set_b'] = b2Color.prototype.set_b = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Color_set_b_1(self, arg0);
};
  b2Color.prototype['__destroy__'] = b2Color.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2Color___destroy___0(self);
};
// b2RopeJoint
function b2RopeJoint() { throw "cannot construct a b2RopeJoint, no constructor in IDL" }
b2RopeJoint.prototype = Object.create(b2Joint.prototype);
b2RopeJoint.prototype.constructor = b2RopeJoint;
b2RopeJoint.prototype.__class__ = b2RopeJoint;
b2RopeJoint.__cache__ = {};
Module['b2RopeJoint'] = b2RopeJoint;

b2RopeJoint.prototype['GetLocalAnchorA'] = b2RopeJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2RopeJoint.prototype['GetLocalAnchorB'] = b2RopeJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2RopeJoint.prototype['SetMaxLength'] = b2RopeJoint.prototype.SetMaxLength = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJoint_SetMaxLength_1(self, arg0);
};;

b2RopeJoint.prototype['GetMaxLength'] = b2RopeJoint.prototype.GetMaxLength = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJoint_GetMaxLength_0(self);
};;

b2RopeJoint.prototype['GetLimitState'] = b2RopeJoint.prototype.GetLimitState = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJoint_GetLimitState_0(self);
};;

b2RopeJoint.prototype['GetType'] = b2RopeJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJoint_GetType_0(self);
};;

b2RopeJoint.prototype['GetBodyA'] = b2RopeJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetBodyA_0(self), b2Body);
};;

b2RopeJoint.prototype['GetBodyB'] = b2RopeJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetBodyB_0(self), b2Body);
};;

b2RopeJoint.prototype['GetAnchorA'] = b2RopeJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetAnchorA_0(self), b2Vec2);
};;

b2RopeJoint.prototype['GetAnchorB'] = b2RopeJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetAnchorB_0(self), b2Vec2);
};;

b2RopeJoint.prototype['GetReactionForce'] = b2RopeJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2RopeJoint.prototype['GetReactionTorque'] = b2RopeJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2RopeJoint_GetReactionTorque_1(self, arg0);
};;

b2RopeJoint.prototype['GetNext'] = b2RopeJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJoint_GetNext_0(self), b2Joint);
};;

b2RopeJoint.prototype['GetUserData'] = b2RopeJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJoint_GetUserData_0(self);
};;

b2RopeJoint.prototype['SetUserData'] = b2RopeJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJoint_SetUserData_1(self, arg0);
};;

b2RopeJoint.prototype['IsActive'] = b2RopeJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RopeJoint_IsActive_0(self));
};;

b2RopeJoint.prototype['GetCollideConnected'] = b2RopeJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RopeJoint_GetCollideConnected_0(self));
};;

  b2RopeJoint.prototype['__destroy__'] = b2RopeJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RopeJoint___destroy___0(self);
};
// b2RayCastInput
function b2RayCastInput() { throw "cannot construct a b2RayCastInput, no constructor in IDL" }
b2RayCastInput.prototype = Object.create(WrapperObject.prototype);
b2RayCastInput.prototype.constructor = b2RayCastInput;
b2RayCastInput.prototype.__class__ = b2RayCastInput;
b2RayCastInput.__cache__ = {};
Module['b2RayCastInput'] = b2RayCastInput;

  b2RayCastInput.prototype['get_p1'] = b2RayCastInput.prototype.get_p1 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RayCastInput_get_p1_0(self), b2Vec2);
};
    b2RayCastInput.prototype['set_p1'] = b2RayCastInput.prototype.set_p1 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RayCastInput_set_p1_1(self, arg0);
};
  b2RayCastInput.prototype['get_p2'] = b2RayCastInput.prototype.get_p2 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RayCastInput_get_p2_0(self), b2Vec2);
};
    b2RayCastInput.prototype['set_p2'] = b2RayCastInput.prototype.set_p2 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RayCastInput_set_p2_1(self, arg0);
};
  b2RayCastInput.prototype['get_maxFraction'] = b2RayCastInput.prototype.get_maxFraction = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RayCastInput_get_maxFraction_0(self);
};
    b2RayCastInput.prototype['set_maxFraction'] = b2RayCastInput.prototype.set_maxFraction = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RayCastInput_set_maxFraction_1(self, arg0);
};
  b2RayCastInput.prototype['__destroy__'] = b2RayCastInput.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RayCastInput___destroy___0(self);
};
// b2PolygonShape
function b2PolygonShape() {
  this.ptr = _emscripten_bind_b2PolygonShape_b2PolygonShape_0();
  getCache(b2PolygonShape)[this.ptr] = this;
};;
b2PolygonShape.prototype = Object.create(b2Shape.prototype);
b2PolygonShape.prototype.constructor = b2PolygonShape;
b2PolygonShape.prototype.__class__ = b2PolygonShape;
b2PolygonShape.__cache__ = {};
Module['b2PolygonShape'] = b2PolygonShape;

b2PolygonShape.prototype['Set'] = b2PolygonShape.prototype.Set = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2PolygonShape_Set_2(self, arg0, arg1);
};;

b2PolygonShape.prototype['SetAsBox'] = b2PolygonShape.prototype.SetAsBox = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  if (arg2 === undefined) { _emscripten_bind_b2PolygonShape_SetAsBox_2(self, arg0, arg1);  return }
  if (arg3 === undefined) { _emscripten_bind_b2PolygonShape_SetAsBox_3(self, arg0, arg1, arg2);  return }
  _emscripten_bind_b2PolygonShape_SetAsBox_4(self, arg0, arg1, arg2, arg3);
};;

b2PolygonShape.prototype['GetVertexCount'] = b2PolygonShape.prototype.GetVertexCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_GetVertexCount_0(self);
};;

b2PolygonShape.prototype['GetVertex'] = b2PolygonShape.prototype.GetVertex = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2PolygonShape_GetVertex_1(self, arg0), b2Vec2);
};;

b2PolygonShape.prototype['GetType'] = b2PolygonShape.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_GetType_0(self);
};;

b2PolygonShape.prototype['GetChildCount'] = b2PolygonShape.prototype.GetChildCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_GetChildCount_0(self);
};;

b2PolygonShape.prototype['TestPoint'] = b2PolygonShape.prototype.TestPoint = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2PolygonShape_TestPoint_2(self, arg0, arg1));
};;

b2PolygonShape.prototype['RayCast'] = b2PolygonShape.prototype.RayCast = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return !!(_emscripten_bind_b2PolygonShape_RayCast_4(self, arg0, arg1, arg2, arg3));
};;

b2PolygonShape.prototype['ComputeAABB'] = b2PolygonShape.prototype.ComputeAABB = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2PolygonShape_ComputeAABB_3(self, arg0, arg1, arg2);
};;

b2PolygonShape.prototype['ComputeMass'] = b2PolygonShape.prototype.ComputeMass = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2PolygonShape_ComputeMass_2(self, arg0, arg1);
};;

  b2PolygonShape.prototype['get_m_centroid'] = b2PolygonShape.prototype.get_m_centroid = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PolygonShape_get_m_centroid_0(self), b2Vec2);
};
    b2PolygonShape.prototype['set_m_centroid'] = b2PolygonShape.prototype.set_m_centroid = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PolygonShape_set_m_centroid_1(self, arg0);
};
  b2PolygonShape.prototype['get_m_count'] = b2PolygonShape.prototype.get_m_count = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_get_m_count_0(self);
};
    b2PolygonShape.prototype['set_m_count'] = b2PolygonShape.prototype.set_m_count = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PolygonShape_set_m_count_1(self, arg0);
};
  b2PolygonShape.prototype['get_m_type'] = b2PolygonShape.prototype.get_m_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_get_m_type_0(self);
};
    b2PolygonShape.prototype['set_m_type'] = b2PolygonShape.prototype.set_m_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PolygonShape_set_m_type_1(self, arg0);
};
  b2PolygonShape.prototype['get_m_radius'] = b2PolygonShape.prototype.get_m_radius = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PolygonShape_get_m_radius_0(self);
};
    b2PolygonShape.prototype['set_m_radius'] = b2PolygonShape.prototype.set_m_radius = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PolygonShape_set_m_radius_1(self, arg0);
};
  b2PolygonShape.prototype['__destroy__'] = b2PolygonShape.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2PolygonShape___destroy___0(self);
};
// b2EdgeShape
function b2EdgeShape() {
  this.ptr = _emscripten_bind_b2EdgeShape_b2EdgeShape_0();
  getCache(b2EdgeShape)[this.ptr] = this;
};;
b2EdgeShape.prototype = Object.create(b2Shape.prototype);
b2EdgeShape.prototype.constructor = b2EdgeShape;
b2EdgeShape.prototype.__class__ = b2EdgeShape;
b2EdgeShape.__cache__ = {};
Module['b2EdgeShape'] = b2EdgeShape;

b2EdgeShape.prototype['Set'] = b2EdgeShape.prototype.Set = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2EdgeShape_Set_2(self, arg0, arg1);
};;

b2EdgeShape.prototype['GetType'] = b2EdgeShape.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2EdgeShape_GetType_0(self);
};;

b2EdgeShape.prototype['GetChildCount'] = b2EdgeShape.prototype.GetChildCount = function() {
  var self = this.ptr;
  return _emscripten_bind_b2EdgeShape_GetChildCount_0(self);
};;

b2EdgeShape.prototype['TestPoint'] = b2EdgeShape.prototype.TestPoint = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_b2EdgeShape_TestPoint_2(self, arg0, arg1));
};;

b2EdgeShape.prototype['RayCast'] = b2EdgeShape.prototype.RayCast = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  return !!(_emscripten_bind_b2EdgeShape_RayCast_4(self, arg0, arg1, arg2, arg3));
};;

b2EdgeShape.prototype['ComputeAABB'] = b2EdgeShape.prototype.ComputeAABB = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2EdgeShape_ComputeAABB_3(self, arg0, arg1, arg2);
};;

b2EdgeShape.prototype['ComputeMass'] = b2EdgeShape.prototype.ComputeMass = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2EdgeShape_ComputeMass_2(self, arg0, arg1);
};;

  b2EdgeShape.prototype['get_m_vertex1'] = b2EdgeShape.prototype.get_m_vertex1 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2EdgeShape_get_m_vertex1_0(self), b2Vec2);
};
    b2EdgeShape.prototype['set_m_vertex1'] = b2EdgeShape.prototype.set_m_vertex1 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_vertex1_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_vertex2'] = b2EdgeShape.prototype.get_m_vertex2 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2EdgeShape_get_m_vertex2_0(self), b2Vec2);
};
    b2EdgeShape.prototype['set_m_vertex2'] = b2EdgeShape.prototype.set_m_vertex2 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_vertex2_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_vertex0'] = b2EdgeShape.prototype.get_m_vertex0 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2EdgeShape_get_m_vertex0_0(self), b2Vec2);
};
    b2EdgeShape.prototype['set_m_vertex0'] = b2EdgeShape.prototype.set_m_vertex0 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_vertex0_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_vertex3'] = b2EdgeShape.prototype.get_m_vertex3 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2EdgeShape_get_m_vertex3_0(self), b2Vec2);
};
    b2EdgeShape.prototype['set_m_vertex3'] = b2EdgeShape.prototype.set_m_vertex3 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_vertex3_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_hasVertex0'] = b2EdgeShape.prototype.get_m_hasVertex0 = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2EdgeShape_get_m_hasVertex0_0(self));
};
    b2EdgeShape.prototype['set_m_hasVertex0'] = b2EdgeShape.prototype.set_m_hasVertex0 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_hasVertex0_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_hasVertex3'] = b2EdgeShape.prototype.get_m_hasVertex3 = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2EdgeShape_get_m_hasVertex3_0(self));
};
    b2EdgeShape.prototype['set_m_hasVertex3'] = b2EdgeShape.prototype.set_m_hasVertex3 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_hasVertex3_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_type'] = b2EdgeShape.prototype.get_m_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2EdgeShape_get_m_type_0(self);
};
    b2EdgeShape.prototype['set_m_type'] = b2EdgeShape.prototype.set_m_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_type_1(self, arg0);
};
  b2EdgeShape.prototype['get_m_radius'] = b2EdgeShape.prototype.get_m_radius = function() {
  var self = this.ptr;
  return _emscripten_bind_b2EdgeShape_get_m_radius_0(self);
};
    b2EdgeShape.prototype['set_m_radius'] = b2EdgeShape.prototype.set_m_radius = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2EdgeShape_set_m_radius_1(self, arg0);
};
  b2EdgeShape.prototype['__destroy__'] = b2EdgeShape.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2EdgeShape___destroy___0(self);
};
// JSContactFilter
function JSContactFilter() {
  this.ptr = _emscripten_bind_JSContactFilter_JSContactFilter_0();
  getCache(JSContactFilter)[this.ptr] = this;
};;
JSContactFilter.prototype = Object.create(b2ContactFilter.prototype);
JSContactFilter.prototype.constructor = JSContactFilter;
JSContactFilter.prototype.__class__ = JSContactFilter;
JSContactFilter.__cache__ = {};
Module['JSContactFilter'] = JSContactFilter;

JSContactFilter.prototype['ShouldCollide'] = JSContactFilter.prototype.ShouldCollide = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  return !!(_emscripten_bind_JSContactFilter_ShouldCollide_2(self, arg0, arg1));
};;

  JSContactFilter.prototype['__destroy__'] = JSContactFilter.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSContactFilter___destroy___0(self);
};
// b2RevoluteJointDef
function b2RevoluteJointDef() {
  this.ptr = _emscripten_bind_b2RevoluteJointDef_b2RevoluteJointDef_0();
  getCache(b2RevoluteJointDef)[this.ptr] = this;
};;
b2RevoluteJointDef.prototype = Object.create(b2JointDef.prototype);
b2RevoluteJointDef.prototype.constructor = b2RevoluteJointDef;
b2RevoluteJointDef.prototype.__class__ = b2RevoluteJointDef;
b2RevoluteJointDef.__cache__ = {};
Module['b2RevoluteJointDef'] = b2RevoluteJointDef;

b2RevoluteJointDef.prototype['Initialize'] = b2RevoluteJointDef.prototype.Initialize = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2RevoluteJointDef_Initialize_3(self, arg0, arg1, arg2);
};;

  b2RevoluteJointDef.prototype['get_localAnchorA'] = b2RevoluteJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2RevoluteJointDef.prototype['set_localAnchorA'] = b2RevoluteJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_localAnchorA_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_localAnchorB'] = b2RevoluteJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2RevoluteJointDef.prototype['set_localAnchorB'] = b2RevoluteJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_localAnchorB_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_referenceAngle'] = b2RevoluteJointDef.prototype.get_referenceAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_referenceAngle_0(self);
};
    b2RevoluteJointDef.prototype['set_referenceAngle'] = b2RevoluteJointDef.prototype.set_referenceAngle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_referenceAngle_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_enableLimit'] = b2RevoluteJointDef.prototype.get_enableLimit = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJointDef_get_enableLimit_0(self));
};
    b2RevoluteJointDef.prototype['set_enableLimit'] = b2RevoluteJointDef.prototype.set_enableLimit = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_enableLimit_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_lowerAngle'] = b2RevoluteJointDef.prototype.get_lowerAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_lowerAngle_0(self);
};
    b2RevoluteJointDef.prototype['set_lowerAngle'] = b2RevoluteJointDef.prototype.set_lowerAngle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_lowerAngle_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_upperAngle'] = b2RevoluteJointDef.prototype.get_upperAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_upperAngle_0(self);
};
    b2RevoluteJointDef.prototype['set_upperAngle'] = b2RevoluteJointDef.prototype.set_upperAngle = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_upperAngle_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_enableMotor'] = b2RevoluteJointDef.prototype.get_enableMotor = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJointDef_get_enableMotor_0(self));
};
    b2RevoluteJointDef.prototype['set_enableMotor'] = b2RevoluteJointDef.prototype.set_enableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_enableMotor_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_motorSpeed'] = b2RevoluteJointDef.prototype.get_motorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_motorSpeed_0(self);
};
    b2RevoluteJointDef.prototype['set_motorSpeed'] = b2RevoluteJointDef.prototype.set_motorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_motorSpeed_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_maxMotorTorque'] = b2RevoluteJointDef.prototype.get_maxMotorTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_maxMotorTorque_0(self);
};
    b2RevoluteJointDef.prototype['set_maxMotorTorque'] = b2RevoluteJointDef.prototype.set_maxMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_maxMotorTorque_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_type'] = b2RevoluteJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_type_0(self);
};
    b2RevoluteJointDef.prototype['set_type'] = b2RevoluteJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_type_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_userData'] = b2RevoluteJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJointDef_get_userData_0(self);
};
    b2RevoluteJointDef.prototype['set_userData'] = b2RevoluteJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_userData_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_bodyA'] = b2RevoluteJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJointDef_get_bodyA_0(self), b2Body);
};
    b2RevoluteJointDef.prototype['set_bodyA'] = b2RevoluteJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_bodyA_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_bodyB'] = b2RevoluteJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJointDef_get_bodyB_0(self), b2Body);
};
    b2RevoluteJointDef.prototype['set_bodyB'] = b2RevoluteJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_bodyB_1(self, arg0);
};
  b2RevoluteJointDef.prototype['get_collideConnected'] = b2RevoluteJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJointDef_get_collideConnected_0(self));
};
    b2RevoluteJointDef.prototype['set_collideConnected'] = b2RevoluteJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJointDef_set_collideConnected_1(self, arg0);
};
  b2RevoluteJointDef.prototype['__destroy__'] = b2RevoluteJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RevoluteJointDef___destroy___0(self);
};
// JSDraw
function JSDraw() {
  this.ptr = _emscripten_bind_JSDraw_JSDraw_0();
  getCache(JSDraw)[this.ptr] = this;
};;
JSDraw.prototype = Object.create(b2Draw.prototype);
JSDraw.prototype.constructor = JSDraw;
JSDraw.prototype.__class__ = JSDraw;
JSDraw.__cache__ = {};
Module['JSDraw'] = JSDraw;

JSDraw.prototype['DrawPolygon'] = JSDraw.prototype.DrawPolygon = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_JSDraw_DrawPolygon_3(self, arg0, arg1, arg2);
};;

JSDraw.prototype['DrawSolidPolygon'] = JSDraw.prototype.DrawSolidPolygon = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_JSDraw_DrawSolidPolygon_3(self, arg0, arg1, arg2);
};;

JSDraw.prototype['DrawCircle'] = JSDraw.prototype.DrawCircle = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_JSDraw_DrawCircle_3(self, arg0, arg1, arg2);
};;

JSDraw.prototype['DrawSolidCircle'] = JSDraw.prototype.DrawSolidCircle = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  _emscripten_bind_JSDraw_DrawSolidCircle_4(self, arg0, arg1, arg2, arg3);
};;

JSDraw.prototype['DrawSegment'] = JSDraw.prototype.DrawSegment = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_JSDraw_DrawSegment_3(self, arg0, arg1, arg2);
};;

JSDraw.prototype['DrawTransform'] = JSDraw.prototype.DrawTransform = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_JSDraw_DrawTransform_1(self, arg0);
};;

  JSDraw.prototype['__destroy__'] = JSDraw.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_JSDraw___destroy___0(self);
};
// b2WheelJoint
function b2WheelJoint() { throw "cannot construct a b2WheelJoint, no constructor in IDL" }
b2WheelJoint.prototype = Object.create(b2Joint.prototype);
b2WheelJoint.prototype.constructor = b2WheelJoint;
b2WheelJoint.prototype.__class__ = b2WheelJoint;
b2WheelJoint.__cache__ = {};
Module['b2WheelJoint'] = b2WheelJoint;

b2WheelJoint.prototype['GetLocalAnchorA'] = b2WheelJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2WheelJoint.prototype['GetLocalAnchorB'] = b2WheelJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2WheelJoint.prototype['GetLocalAxisA'] = b2WheelJoint.prototype.GetLocalAxisA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetLocalAxisA_0(self), b2Vec2);
};;

b2WheelJoint.prototype['GetJointTranslation'] = b2WheelJoint.prototype.GetJointTranslation = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetJointTranslation_0(self);
};;

b2WheelJoint.prototype['GetJointSpeed'] = b2WheelJoint.prototype.GetJointSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetJointSpeed_0(self);
};;

b2WheelJoint.prototype['IsMotorEnabled'] = b2WheelJoint.prototype.IsMotorEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WheelJoint_IsMotorEnabled_0(self));
};;

b2WheelJoint.prototype['EnableMotor'] = b2WheelJoint.prototype.EnableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_EnableMotor_1(self, arg0);
};;

b2WheelJoint.prototype['SetMotorSpeed'] = b2WheelJoint.prototype.SetMotorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_SetMotorSpeed_1(self, arg0);
};;

b2WheelJoint.prototype['GetMotorSpeed'] = b2WheelJoint.prototype.GetMotorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetMotorSpeed_0(self);
};;

b2WheelJoint.prototype['SetMaxMotorTorque'] = b2WheelJoint.prototype.SetMaxMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_SetMaxMotorTorque_1(self, arg0);
};;

b2WheelJoint.prototype['GetMaxMotorTorque'] = b2WheelJoint.prototype.GetMaxMotorTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetMaxMotorTorque_0(self);
};;

b2WheelJoint.prototype['GetMotorTorque'] = b2WheelJoint.prototype.GetMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2WheelJoint_GetMotorTorque_1(self, arg0);
};;

b2WheelJoint.prototype['SetSpringFrequencyHz'] = b2WheelJoint.prototype.SetSpringFrequencyHz = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_SetSpringFrequencyHz_1(self, arg0);
};;

b2WheelJoint.prototype['GetSpringFrequencyHz'] = b2WheelJoint.prototype.GetSpringFrequencyHz = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetSpringFrequencyHz_0(self);
};;

b2WheelJoint.prototype['SetSpringDampingRatio'] = b2WheelJoint.prototype.SetSpringDampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_SetSpringDampingRatio_1(self, arg0);
};;

b2WheelJoint.prototype['GetSpringDampingRatio'] = b2WheelJoint.prototype.GetSpringDampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetSpringDampingRatio_0(self);
};;

b2WheelJoint.prototype['GetType'] = b2WheelJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetType_0(self);
};;

b2WheelJoint.prototype['GetBodyA'] = b2WheelJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetBodyA_0(self), b2Body);
};;

b2WheelJoint.prototype['GetBodyB'] = b2WheelJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetBodyB_0(self), b2Body);
};;

b2WheelJoint.prototype['GetAnchorA'] = b2WheelJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetAnchorA_0(self), b2Vec2);
};;

b2WheelJoint.prototype['GetAnchorB'] = b2WheelJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetAnchorB_0(self), b2Vec2);
};;

b2WheelJoint.prototype['GetReactionForce'] = b2WheelJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2WheelJoint.prototype['GetReactionTorque'] = b2WheelJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2WheelJoint_GetReactionTorque_1(self, arg0);
};;

b2WheelJoint.prototype['GetNext'] = b2WheelJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2WheelJoint_GetNext_0(self), b2Joint);
};;

b2WheelJoint.prototype['GetUserData'] = b2WheelJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2WheelJoint_GetUserData_0(self);
};;

b2WheelJoint.prototype['SetUserData'] = b2WheelJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2WheelJoint_SetUserData_1(self, arg0);
};;

b2WheelJoint.prototype['IsActive'] = b2WheelJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WheelJoint_IsActive_0(self));
};;

b2WheelJoint.prototype['GetCollideConnected'] = b2WheelJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2WheelJoint_GetCollideConnected_0(self));
};;

  b2WheelJoint.prototype['__destroy__'] = b2WheelJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2WheelJoint___destroy___0(self);
};
// b2PulleyJoint
function b2PulleyJoint() { throw "cannot construct a b2PulleyJoint, no constructor in IDL" }
b2PulleyJoint.prototype = Object.create(b2Joint.prototype);
b2PulleyJoint.prototype.constructor = b2PulleyJoint;
b2PulleyJoint.prototype.__class__ = b2PulleyJoint;
b2PulleyJoint.__cache__ = {};
Module['b2PulleyJoint'] = b2PulleyJoint;

b2PulleyJoint.prototype['GetGroundAnchorA'] = b2PulleyJoint.prototype.GetGroundAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetGroundAnchorA_0(self), b2Vec2);
};;

b2PulleyJoint.prototype['GetGroundAnchorB'] = b2PulleyJoint.prototype.GetGroundAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetGroundAnchorB_0(self), b2Vec2);
};;

b2PulleyJoint.prototype['GetLengthA'] = b2PulleyJoint.prototype.GetLengthA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetLengthA_0(self);
};;

b2PulleyJoint.prototype['GetLengthB'] = b2PulleyJoint.prototype.GetLengthB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetLengthB_0(self);
};;

b2PulleyJoint.prototype['GetRatio'] = b2PulleyJoint.prototype.GetRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetRatio_0(self);
};;

b2PulleyJoint.prototype['GetCurrentLengthA'] = b2PulleyJoint.prototype.GetCurrentLengthA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetCurrentLengthA_0(self);
};;

b2PulleyJoint.prototype['GetCurrentLengthB'] = b2PulleyJoint.prototype.GetCurrentLengthB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetCurrentLengthB_0(self);
};;

b2PulleyJoint.prototype['GetType'] = b2PulleyJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetType_0(self);
};;

b2PulleyJoint.prototype['GetBodyA'] = b2PulleyJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetBodyA_0(self), b2Body);
};;

b2PulleyJoint.prototype['GetBodyB'] = b2PulleyJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetBodyB_0(self), b2Body);
};;

b2PulleyJoint.prototype['GetAnchorA'] = b2PulleyJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetAnchorA_0(self), b2Vec2);
};;

b2PulleyJoint.prototype['GetAnchorB'] = b2PulleyJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetAnchorB_0(self), b2Vec2);
};;

b2PulleyJoint.prototype['GetReactionForce'] = b2PulleyJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2PulleyJoint.prototype['GetReactionTorque'] = b2PulleyJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2PulleyJoint_GetReactionTorque_1(self, arg0);
};;

b2PulleyJoint.prototype['GetNext'] = b2PulleyJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2PulleyJoint_GetNext_0(self), b2Joint);
};;

b2PulleyJoint.prototype['GetUserData'] = b2PulleyJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2PulleyJoint_GetUserData_0(self);
};;

b2PulleyJoint.prototype['SetUserData'] = b2PulleyJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2PulleyJoint_SetUserData_1(self, arg0);
};;

b2PulleyJoint.prototype['IsActive'] = b2PulleyJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PulleyJoint_IsActive_0(self));
};;

b2PulleyJoint.prototype['GetCollideConnected'] = b2PulleyJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2PulleyJoint_GetCollideConnected_0(self));
};;

  b2PulleyJoint.prototype['__destroy__'] = b2PulleyJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2PulleyJoint___destroy___0(self);
};
// b2MouseJointDef
function b2MouseJointDef() {
  this.ptr = _emscripten_bind_b2MouseJointDef_b2MouseJointDef_0();
  getCache(b2MouseJointDef)[this.ptr] = this;
};;
b2MouseJointDef.prototype = Object.create(b2JointDef.prototype);
b2MouseJointDef.prototype.constructor = b2MouseJointDef;
b2MouseJointDef.prototype.__class__ = b2MouseJointDef;
b2MouseJointDef.__cache__ = {};
Module['b2MouseJointDef'] = b2MouseJointDef;

  b2MouseJointDef.prototype['get_target'] = b2MouseJointDef.prototype.get_target = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJointDef_get_target_0(self), b2Vec2);
};
    b2MouseJointDef.prototype['set_target'] = b2MouseJointDef.prototype.set_target = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_target_1(self, arg0);
};
  b2MouseJointDef.prototype['get_maxForce'] = b2MouseJointDef.prototype.get_maxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJointDef_get_maxForce_0(self);
};
    b2MouseJointDef.prototype['set_maxForce'] = b2MouseJointDef.prototype.set_maxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_maxForce_1(self, arg0);
};
  b2MouseJointDef.prototype['get_frequencyHz'] = b2MouseJointDef.prototype.get_frequencyHz = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJointDef_get_frequencyHz_0(self);
};
    b2MouseJointDef.prototype['set_frequencyHz'] = b2MouseJointDef.prototype.set_frequencyHz = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_frequencyHz_1(self, arg0);
};
  b2MouseJointDef.prototype['get_dampingRatio'] = b2MouseJointDef.prototype.get_dampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJointDef_get_dampingRatio_0(self);
};
    b2MouseJointDef.prototype['set_dampingRatio'] = b2MouseJointDef.prototype.set_dampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_dampingRatio_1(self, arg0);
};
  b2MouseJointDef.prototype['get_type'] = b2MouseJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJointDef_get_type_0(self);
};
    b2MouseJointDef.prototype['set_type'] = b2MouseJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_type_1(self, arg0);
};
  b2MouseJointDef.prototype['get_userData'] = b2MouseJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MouseJointDef_get_userData_0(self);
};
    b2MouseJointDef.prototype['set_userData'] = b2MouseJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_userData_1(self, arg0);
};
  b2MouseJointDef.prototype['get_bodyA'] = b2MouseJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJointDef_get_bodyA_0(self), b2Body);
};
    b2MouseJointDef.prototype['set_bodyA'] = b2MouseJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_bodyA_1(self, arg0);
};
  b2MouseJointDef.prototype['get_bodyB'] = b2MouseJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MouseJointDef_get_bodyB_0(self), b2Body);
};
    b2MouseJointDef.prototype['set_bodyB'] = b2MouseJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_bodyB_1(self, arg0);
};
  b2MouseJointDef.prototype['get_collideConnected'] = b2MouseJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MouseJointDef_get_collideConnected_0(self));
};
    b2MouseJointDef.prototype['set_collideConnected'] = b2MouseJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MouseJointDef_set_collideConnected_1(self, arg0);
};
  b2MouseJointDef.prototype['__destroy__'] = b2MouseJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2MouseJointDef___destroy___0(self);
};
// b2Contact
function b2Contact() { throw "cannot construct a b2Contact, no constructor in IDL" }
b2Contact.prototype = Object.create(WrapperObject.prototype);
b2Contact.prototype.constructor = b2Contact;
b2Contact.prototype.__class__ = b2Contact;
b2Contact.__cache__ = {};
Module['b2Contact'] = b2Contact;

b2Contact.prototype['GetManifold'] = b2Contact.prototype.GetManifold = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Contact_GetManifold_0(self), b2Manifold);
};;

b2Contact.prototype['IsTouching'] = b2Contact.prototype.IsTouching = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Contact_IsTouching_0(self));
};;

b2Contact.prototype['SetEnabled'] = b2Contact.prototype.SetEnabled = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Contact_SetEnabled_1(self, arg0);
};;

b2Contact.prototype['IsEnabled'] = b2Contact.prototype.IsEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Contact_IsEnabled_0(self));
};;

b2Contact.prototype['GetNext'] = b2Contact.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Contact_GetNext_0(self), b2Contact);
};;

b2Contact.prototype['GetFixtureA'] = b2Contact.prototype.GetFixtureA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Contact_GetFixtureA_0(self), b2Fixture);
};;

b2Contact.prototype['GetChildIndexA'] = b2Contact.prototype.GetChildIndexA = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Contact_GetChildIndexA_0(self);
};;

b2Contact.prototype['GetFixtureB'] = b2Contact.prototype.GetFixtureB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Contact_GetFixtureB_0(self), b2Fixture);
};;

b2Contact.prototype['GetChildIndexB'] = b2Contact.prototype.GetChildIndexB = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Contact_GetChildIndexB_0(self);
};;

b2Contact.prototype['SetFriction'] = b2Contact.prototype.SetFriction = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Contact_SetFriction_1(self, arg0);
};;

b2Contact.prototype['GetFriction'] = b2Contact.prototype.GetFriction = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Contact_GetFriction_0(self);
};;

b2Contact.prototype['ResetFriction'] = b2Contact.prototype.ResetFriction = function() {
  var self = this.ptr;
  _emscripten_bind_b2Contact_ResetFriction_0(self);
};;

b2Contact.prototype['SetRestitution'] = b2Contact.prototype.SetRestitution = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Contact_SetRestitution_1(self, arg0);
};;

b2Contact.prototype['GetRestitution'] = b2Contact.prototype.GetRestitution = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Contact_GetRestitution_0(self);
};;

b2Contact.prototype['ResetRestitution'] = b2Contact.prototype.ResetRestitution = function() {
  var self = this.ptr;
  _emscripten_bind_b2Contact_ResetRestitution_0(self);
};;

b2Contact.prototype['SetTangentSpeed'] = b2Contact.prototype.SetTangentSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Contact_SetTangentSpeed_1(self, arg0);
};;

b2Contact.prototype['GetTangentSpeed'] = b2Contact.prototype.GetTangentSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Contact_GetTangentSpeed_0(self);
};;

// b2DistanceJointDef
function b2DistanceJointDef() {
  this.ptr = _emscripten_bind_b2DistanceJointDef_b2DistanceJointDef_0();
  getCache(b2DistanceJointDef)[this.ptr] = this;
};;
b2DistanceJointDef.prototype = Object.create(b2JointDef.prototype);
b2DistanceJointDef.prototype.constructor = b2DistanceJointDef;
b2DistanceJointDef.prototype.__class__ = b2DistanceJointDef;
b2DistanceJointDef.__cache__ = {};
Module['b2DistanceJointDef'] = b2DistanceJointDef;

b2DistanceJointDef.prototype['Initialize'] = b2DistanceJointDef.prototype.Initialize = function(arg0, arg1, arg2, arg3) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  if (arg3 && typeof arg3 === 'object') arg3 = arg3.ptr;
  _emscripten_bind_b2DistanceJointDef_Initialize_4(self, arg0, arg1, arg2, arg3);
};;

  b2DistanceJointDef.prototype['get_localAnchorA'] = b2DistanceJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2DistanceJointDef.prototype['set_localAnchorA'] = b2DistanceJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_localAnchorA_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_localAnchorB'] = b2DistanceJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2DistanceJointDef.prototype['set_localAnchorB'] = b2DistanceJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_localAnchorB_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_length'] = b2DistanceJointDef.prototype.get_length = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJointDef_get_length_0(self);
};
    b2DistanceJointDef.prototype['set_length'] = b2DistanceJointDef.prototype.set_length = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_length_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_frequencyHz'] = b2DistanceJointDef.prototype.get_frequencyHz = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJointDef_get_frequencyHz_0(self);
};
    b2DistanceJointDef.prototype['set_frequencyHz'] = b2DistanceJointDef.prototype.set_frequencyHz = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_frequencyHz_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_dampingRatio'] = b2DistanceJointDef.prototype.get_dampingRatio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJointDef_get_dampingRatio_0(self);
};
    b2DistanceJointDef.prototype['set_dampingRatio'] = b2DistanceJointDef.prototype.set_dampingRatio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_dampingRatio_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_type'] = b2DistanceJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJointDef_get_type_0(self);
};
    b2DistanceJointDef.prototype['set_type'] = b2DistanceJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_type_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_userData'] = b2DistanceJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2DistanceJointDef_get_userData_0(self);
};
    b2DistanceJointDef.prototype['set_userData'] = b2DistanceJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_userData_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_bodyA'] = b2DistanceJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJointDef_get_bodyA_0(self), b2Body);
};
    b2DistanceJointDef.prototype['set_bodyA'] = b2DistanceJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_bodyA_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_bodyB'] = b2DistanceJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2DistanceJointDef_get_bodyB_0(self), b2Body);
};
    b2DistanceJointDef.prototype['set_bodyB'] = b2DistanceJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_bodyB_1(self, arg0);
};
  b2DistanceJointDef.prototype['get_collideConnected'] = b2DistanceJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2DistanceJointDef_get_collideConnected_0(self));
};
    b2DistanceJointDef.prototype['set_collideConnected'] = b2DistanceJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2DistanceJointDef_set_collideConnected_1(self, arg0);
};
  b2DistanceJointDef.prototype['__destroy__'] = b2DistanceJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2DistanceJointDef___destroy___0(self);
};
// b2Body
function b2Body() { throw "cannot construct a b2Body, no constructor in IDL" }
b2Body.prototype = Object.create(WrapperObject.prototype);
b2Body.prototype.constructor = b2Body;
b2Body.prototype.__class__ = b2Body;
b2Body.__cache__ = {};
Module['b2Body'] = b2Body;

b2Body.prototype['CreateFixture'] = b2Body.prototype.CreateFixture = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg1 === undefined) { return wrapPointer(_emscripten_bind_b2Body_CreateFixture_1(self, arg0), b2Fixture) }
  return wrapPointer(_emscripten_bind_b2Body_CreateFixture_2(self, arg0, arg1), b2Fixture);
};;

b2Body.prototype['DestroyFixture'] = b2Body.prototype.DestroyFixture = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_DestroyFixture_1(self, arg0);
};;

b2Body.prototype['SetTransform'] = b2Body.prototype.SetTransform = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Body_SetTransform_2(self, arg0, arg1);
};;

b2Body.prototype['GetTransform'] = b2Body.prototype.GetTransform = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetTransform_0(self), b2Transform);
};;

b2Body.prototype['GetPosition'] = b2Body.prototype.GetPosition = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetPosition_0(self), b2Vec2);
};;

b2Body.prototype['GetAngle'] = b2Body.prototype.GetAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetAngle_0(self);
};;

b2Body.prototype['GetWorldCenter'] = b2Body.prototype.GetWorldCenter = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetWorldCenter_0(self), b2Vec2);
};;

b2Body.prototype['GetLocalCenter'] = b2Body.prototype.GetLocalCenter = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLocalCenter_0(self), b2Vec2);
};;

b2Body.prototype['SetLinearVelocity'] = b2Body.prototype.SetLinearVelocity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetLinearVelocity_1(self, arg0);
};;

b2Body.prototype['GetLinearVelocity'] = b2Body.prototype.GetLinearVelocity = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLinearVelocity_0(self), b2Vec2);
};;

b2Body.prototype['SetAngularVelocity'] = b2Body.prototype.SetAngularVelocity = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetAngularVelocity_1(self, arg0);
};;

b2Body.prototype['GetAngularVelocity'] = b2Body.prototype.GetAngularVelocity = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetAngularVelocity_0(self);
};;

b2Body.prototype['ApplyForce'] = b2Body.prototype.ApplyForce = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2Body_ApplyForce_3(self, arg0, arg1, arg2);
};;

b2Body.prototype['ApplyForceToCenter'] = b2Body.prototype.ApplyForceToCenter = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Body_ApplyForceToCenter_2(self, arg0, arg1);
};;

b2Body.prototype['ApplyTorque'] = b2Body.prototype.ApplyTorque = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Body_ApplyTorque_2(self, arg0, arg1);
};;

b2Body.prototype['ApplyLinearImpulse'] = b2Body.prototype.ApplyLinearImpulse = function(arg0, arg1, arg2) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  if (arg2 && typeof arg2 === 'object') arg2 = arg2.ptr;
  _emscripten_bind_b2Body_ApplyLinearImpulse_3(self, arg0, arg1, arg2);
};;

b2Body.prototype['ApplyAngularImpulse'] = b2Body.prototype.ApplyAngularImpulse = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2Body_ApplyAngularImpulse_2(self, arg0, arg1);
};;

b2Body.prototype['GetMass'] = b2Body.prototype.GetMass = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetMass_0(self);
};;

b2Body.prototype['GetInertia'] = b2Body.prototype.GetInertia = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetInertia_0(self);
};;

b2Body.prototype['GetMassData'] = b2Body.prototype.GetMassData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_GetMassData_1(self, arg0);
};;

b2Body.prototype['SetMassData'] = b2Body.prototype.SetMassData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetMassData_1(self, arg0);
};;

b2Body.prototype['ResetMassData'] = b2Body.prototype.ResetMassData = function() {
  var self = this.ptr;
  _emscripten_bind_b2Body_ResetMassData_0(self);
};;

b2Body.prototype['GetWorldPoint'] = b2Body.prototype.GetWorldPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetWorldPoint_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetWorldVector'] = b2Body.prototype.GetWorldVector = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetWorldVector_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetLocalPoint'] = b2Body.prototype.GetLocalPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLocalPoint_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetLocalVector'] = b2Body.prototype.GetLocalVector = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLocalVector_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetLinearVelocityFromWorldPoint'] = b2Body.prototype.GetLinearVelocityFromWorldPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLinearVelocityFromWorldPoint_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetLinearVelocityFromLocalPoint'] = b2Body.prototype.GetLinearVelocityFromLocalPoint = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetLinearVelocityFromLocalPoint_1(self, arg0), b2Vec2);
};;

b2Body.prototype['GetLinearDamping'] = b2Body.prototype.GetLinearDamping = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetLinearDamping_0(self);
};;

b2Body.prototype['SetLinearDamping'] = b2Body.prototype.SetLinearDamping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetLinearDamping_1(self, arg0);
};;

b2Body.prototype['GetAngularDamping'] = b2Body.prototype.GetAngularDamping = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetAngularDamping_0(self);
};;

b2Body.prototype['SetAngularDamping'] = b2Body.prototype.SetAngularDamping = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetAngularDamping_1(self, arg0);
};;

b2Body.prototype['GetGravityScale'] = b2Body.prototype.GetGravityScale = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetGravityScale_0(self);
};;

b2Body.prototype['SetGravityScale'] = b2Body.prototype.SetGravityScale = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetGravityScale_1(self, arg0);
};;

b2Body.prototype['SetType'] = b2Body.prototype.SetType = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetType_1(self, arg0);
};;

b2Body.prototype['GetType'] = b2Body.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetType_0(self);
};;

b2Body.prototype['SetBullet'] = b2Body.prototype.SetBullet = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetBullet_1(self, arg0);
};;

b2Body.prototype['IsBullet'] = b2Body.prototype.IsBullet = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Body_IsBullet_0(self));
};;

b2Body.prototype['SetSleepingAllowed'] = b2Body.prototype.SetSleepingAllowed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetSleepingAllowed_1(self, arg0);
};;

b2Body.prototype['IsSleepingAllowed'] = b2Body.prototype.IsSleepingAllowed = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Body_IsSleepingAllowed_0(self));
};;

b2Body.prototype['SetAwake'] = b2Body.prototype.SetAwake = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetAwake_1(self, arg0);
};;

b2Body.prototype['IsAwake'] = b2Body.prototype.IsAwake = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Body_IsAwake_0(self));
};;

b2Body.prototype['SetActive'] = b2Body.prototype.SetActive = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetActive_1(self, arg0);
};;

b2Body.prototype['IsActive'] = b2Body.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Body_IsActive_0(self));
};;

b2Body.prototype['SetFixedRotation'] = b2Body.prototype.SetFixedRotation = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetFixedRotation_1(self, arg0);
};;

b2Body.prototype['IsFixedRotation'] = b2Body.prototype.IsFixedRotation = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2Body_IsFixedRotation_0(self));
};;

b2Body.prototype['GetFixtureList'] = b2Body.prototype.GetFixtureList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetFixtureList_0(self), b2Fixture);
};;

b2Body.prototype['GetJointList'] = b2Body.prototype.GetJointList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetJointList_0(self), b2JointEdge);
};;

b2Body.prototype['GetContactList'] = b2Body.prototype.GetContactList = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetContactList_0(self), b2ContactEdge);
};;

b2Body.prototype['GetNext'] = b2Body.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetNext_0(self), b2Body);
};;

b2Body.prototype['GetUserData'] = b2Body.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2Body_GetUserData_0(self);
};;

b2Body.prototype['SetUserData'] = b2Body.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2Body_SetUserData_1(self, arg0);
};;

b2Body.prototype['GetWorld'] = b2Body.prototype.GetWorld = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2Body_GetWorld_0(self), b2World);
};;

b2Body.prototype['Dump'] = b2Body.prototype.Dump = function() {
  var self = this.ptr;
  _emscripten_bind_b2Body_Dump_0(self);
};;

// b2FrictionJoint
function b2FrictionJoint() { throw "cannot construct a b2FrictionJoint, no constructor in IDL" }
b2FrictionJoint.prototype = Object.create(b2Joint.prototype);
b2FrictionJoint.prototype.constructor = b2FrictionJoint;
b2FrictionJoint.prototype.__class__ = b2FrictionJoint;
b2FrictionJoint.__cache__ = {};
Module['b2FrictionJoint'] = b2FrictionJoint;

b2FrictionJoint.prototype['GetLocalAnchorA'] = b2FrictionJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2FrictionJoint.prototype['GetLocalAnchorB'] = b2FrictionJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2FrictionJoint.prototype['SetMaxForce'] = b2FrictionJoint.prototype.SetMaxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJoint_SetMaxForce_1(self, arg0);
};;

b2FrictionJoint.prototype['GetMaxForce'] = b2FrictionJoint.prototype.GetMaxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJoint_GetMaxForce_0(self);
};;

b2FrictionJoint.prototype['SetMaxTorque'] = b2FrictionJoint.prototype.SetMaxTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJoint_SetMaxTorque_1(self, arg0);
};;

b2FrictionJoint.prototype['GetMaxTorque'] = b2FrictionJoint.prototype.GetMaxTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJoint_GetMaxTorque_0(self);
};;

b2FrictionJoint.prototype['GetType'] = b2FrictionJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJoint_GetType_0(self);
};;

b2FrictionJoint.prototype['GetBodyA'] = b2FrictionJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetBodyA_0(self), b2Body);
};;

b2FrictionJoint.prototype['GetBodyB'] = b2FrictionJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetBodyB_0(self), b2Body);
};;

b2FrictionJoint.prototype['GetAnchorA'] = b2FrictionJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetAnchorA_0(self), b2Vec2);
};;

b2FrictionJoint.prototype['GetAnchorB'] = b2FrictionJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetAnchorB_0(self), b2Vec2);
};;

b2FrictionJoint.prototype['GetReactionForce'] = b2FrictionJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2FrictionJoint.prototype['GetReactionTorque'] = b2FrictionJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2FrictionJoint_GetReactionTorque_1(self, arg0);
};;

b2FrictionJoint.prototype['GetNext'] = b2FrictionJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2FrictionJoint_GetNext_0(self), b2Joint);
};;

b2FrictionJoint.prototype['GetUserData'] = b2FrictionJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2FrictionJoint_GetUserData_0(self);
};;

b2FrictionJoint.prototype['SetUserData'] = b2FrictionJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2FrictionJoint_SetUserData_1(self, arg0);
};;

b2FrictionJoint.prototype['IsActive'] = b2FrictionJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2FrictionJoint_IsActive_0(self));
};;

b2FrictionJoint.prototype['GetCollideConnected'] = b2FrictionJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2FrictionJoint_GetCollideConnected_0(self));
};;

  b2FrictionJoint.prototype['__destroy__'] = b2FrictionJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2FrictionJoint___destroy___0(self);
};
// b2DestructionListener
function b2DestructionListener() { throw "cannot construct a b2DestructionListener, no constructor in IDL" }
b2DestructionListener.prototype = Object.create(WrapperObject.prototype);
b2DestructionListener.prototype.constructor = b2DestructionListener;
b2DestructionListener.prototype.__class__ = b2DestructionListener;
b2DestructionListener.__cache__ = {};
Module['b2DestructionListener'] = b2DestructionListener;

  b2DestructionListener.prototype['__destroy__'] = b2DestructionListener.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2DestructionListener___destroy___0(self);
};
// b2GearJointDef
function b2GearJointDef() {
  this.ptr = _emscripten_bind_b2GearJointDef_b2GearJointDef_0();
  getCache(b2GearJointDef)[this.ptr] = this;
};;
b2GearJointDef.prototype = Object.create(b2JointDef.prototype);
b2GearJointDef.prototype.constructor = b2GearJointDef;
b2GearJointDef.prototype.__class__ = b2GearJointDef;
b2GearJointDef.__cache__ = {};
Module['b2GearJointDef'] = b2GearJointDef;

  b2GearJointDef.prototype['get_joint1'] = b2GearJointDef.prototype.get_joint1 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJointDef_get_joint1_0(self), b2Joint);
};
    b2GearJointDef.prototype['set_joint1'] = b2GearJointDef.prototype.set_joint1 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_joint1_1(self, arg0);
};
  b2GearJointDef.prototype['get_joint2'] = b2GearJointDef.prototype.get_joint2 = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJointDef_get_joint2_0(self), b2Joint);
};
    b2GearJointDef.prototype['set_joint2'] = b2GearJointDef.prototype.set_joint2 = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_joint2_1(self, arg0);
};
  b2GearJointDef.prototype['get_ratio'] = b2GearJointDef.prototype.get_ratio = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJointDef_get_ratio_0(self);
};
    b2GearJointDef.prototype['set_ratio'] = b2GearJointDef.prototype.set_ratio = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_ratio_1(self, arg0);
};
  b2GearJointDef.prototype['get_type'] = b2GearJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJointDef_get_type_0(self);
};
    b2GearJointDef.prototype['set_type'] = b2GearJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_type_1(self, arg0);
};
  b2GearJointDef.prototype['get_userData'] = b2GearJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2GearJointDef_get_userData_0(self);
};
    b2GearJointDef.prototype['set_userData'] = b2GearJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_userData_1(self, arg0);
};
  b2GearJointDef.prototype['get_bodyA'] = b2GearJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJointDef_get_bodyA_0(self), b2Body);
};
    b2GearJointDef.prototype['set_bodyA'] = b2GearJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_bodyA_1(self, arg0);
};
  b2GearJointDef.prototype['get_bodyB'] = b2GearJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2GearJointDef_get_bodyB_0(self), b2Body);
};
    b2GearJointDef.prototype['set_bodyB'] = b2GearJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_bodyB_1(self, arg0);
};
  b2GearJointDef.prototype['get_collideConnected'] = b2GearJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2GearJointDef_get_collideConnected_0(self));
};
    b2GearJointDef.prototype['set_collideConnected'] = b2GearJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2GearJointDef_set_collideConnected_1(self, arg0);
};
  b2GearJointDef.prototype['__destroy__'] = b2GearJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2GearJointDef___destroy___0(self);
};
// b2RevoluteJoint
function b2RevoluteJoint() { throw "cannot construct a b2RevoluteJoint, no constructor in IDL" }
b2RevoluteJoint.prototype = Object.create(b2Joint.prototype);
b2RevoluteJoint.prototype.constructor = b2RevoluteJoint;
b2RevoluteJoint.prototype.__class__ = b2RevoluteJoint;
b2RevoluteJoint.__cache__ = {};
Module['b2RevoluteJoint'] = b2RevoluteJoint;

b2RevoluteJoint.prototype['GetLocalAnchorA'] = b2RevoluteJoint.prototype.GetLocalAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetLocalAnchorA_0(self), b2Vec2);
};;

b2RevoluteJoint.prototype['GetLocalAnchorB'] = b2RevoluteJoint.prototype.GetLocalAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetLocalAnchorB_0(self), b2Vec2);
};;

b2RevoluteJoint.prototype['GetReferenceAngle'] = b2RevoluteJoint.prototype.GetReferenceAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetReferenceAngle_0(self);
};;

b2RevoluteJoint.prototype['GetJointAngle'] = b2RevoluteJoint.prototype.GetJointAngle = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetJointAngle_0(self);
};;

b2RevoluteJoint.prototype['GetJointSpeed'] = b2RevoluteJoint.prototype.GetJointSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetJointSpeed_0(self);
};;

b2RevoluteJoint.prototype['IsLimitEnabled'] = b2RevoluteJoint.prototype.IsLimitEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJoint_IsLimitEnabled_0(self));
};;

b2RevoluteJoint.prototype['EnableLimit'] = b2RevoluteJoint.prototype.EnableLimit = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJoint_EnableLimit_1(self, arg0);
};;

b2RevoluteJoint.prototype['GetLowerLimit'] = b2RevoluteJoint.prototype.GetLowerLimit = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetLowerLimit_0(self);
};;

b2RevoluteJoint.prototype['GetUpperLimit'] = b2RevoluteJoint.prototype.GetUpperLimit = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetUpperLimit_0(self);
};;

b2RevoluteJoint.prototype['SetLimits'] = b2RevoluteJoint.prototype.SetLimits = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2RevoluteJoint_SetLimits_2(self, arg0, arg1);
};;

b2RevoluteJoint.prototype['IsMotorEnabled'] = b2RevoluteJoint.prototype.IsMotorEnabled = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJoint_IsMotorEnabled_0(self));
};;

b2RevoluteJoint.prototype['EnableMotor'] = b2RevoluteJoint.prototype.EnableMotor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJoint_EnableMotor_1(self, arg0);
};;

b2RevoluteJoint.prototype['SetMotorSpeed'] = b2RevoluteJoint.prototype.SetMotorSpeed = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJoint_SetMotorSpeed_1(self, arg0);
};;

b2RevoluteJoint.prototype['GetMotorSpeed'] = b2RevoluteJoint.prototype.GetMotorSpeed = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetMotorSpeed_0(self);
};;

b2RevoluteJoint.prototype['SetMaxMotorTorque'] = b2RevoluteJoint.prototype.SetMaxMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJoint_SetMaxMotorTorque_1(self, arg0);
};;

b2RevoluteJoint.prototype['GetMaxMotorTorque'] = b2RevoluteJoint.prototype.GetMaxMotorTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetMaxMotorTorque_0(self);
};;

b2RevoluteJoint.prototype['GetMotorTorque'] = b2RevoluteJoint.prototype.GetMotorTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetMotorTorque_1(self, arg0);
};;

b2RevoluteJoint.prototype['GetType'] = b2RevoluteJoint.prototype.GetType = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetType_0(self);
};;

b2RevoluteJoint.prototype['GetBodyA'] = b2RevoluteJoint.prototype.GetBodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetBodyA_0(self), b2Body);
};;

b2RevoluteJoint.prototype['GetBodyB'] = b2RevoluteJoint.prototype.GetBodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetBodyB_0(self), b2Body);
};;

b2RevoluteJoint.prototype['GetAnchorA'] = b2RevoluteJoint.prototype.GetAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetAnchorA_0(self), b2Vec2);
};;

b2RevoluteJoint.prototype['GetAnchorB'] = b2RevoluteJoint.prototype.GetAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetAnchorB_0(self), b2Vec2);
};;

b2RevoluteJoint.prototype['GetReactionForce'] = b2RevoluteJoint.prototype.GetReactionForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetReactionForce_1(self, arg0), b2Vec2);
};;

b2RevoluteJoint.prototype['GetReactionTorque'] = b2RevoluteJoint.prototype.GetReactionTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetReactionTorque_1(self, arg0);
};;

b2RevoluteJoint.prototype['GetNext'] = b2RevoluteJoint.prototype.GetNext = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RevoluteJoint_GetNext_0(self), b2Joint);
};;

b2RevoluteJoint.prototype['GetUserData'] = b2RevoluteJoint.prototype.GetUserData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RevoluteJoint_GetUserData_0(self);
};;

b2RevoluteJoint.prototype['SetUserData'] = b2RevoluteJoint.prototype.SetUserData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RevoluteJoint_SetUserData_1(self, arg0);
};;

b2RevoluteJoint.prototype['IsActive'] = b2RevoluteJoint.prototype.IsActive = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJoint_IsActive_0(self));
};;

b2RevoluteJoint.prototype['GetCollideConnected'] = b2RevoluteJoint.prototype.GetCollideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RevoluteJoint_GetCollideConnected_0(self));
};;

  b2RevoluteJoint.prototype['__destroy__'] = b2RevoluteJoint.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RevoluteJoint___destroy___0(self);
};
// b2ContactEdge
function b2ContactEdge() {
  this.ptr = _emscripten_bind_b2ContactEdge_b2ContactEdge_0();
  getCache(b2ContactEdge)[this.ptr] = this;
};;
b2ContactEdge.prototype = Object.create(WrapperObject.prototype);
b2ContactEdge.prototype.constructor = b2ContactEdge;
b2ContactEdge.prototype.__class__ = b2ContactEdge;
b2ContactEdge.__cache__ = {};
Module['b2ContactEdge'] = b2ContactEdge;

  b2ContactEdge.prototype['get_other'] = b2ContactEdge.prototype.get_other = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ContactEdge_get_other_0(self), b2Body);
};
    b2ContactEdge.prototype['set_other'] = b2ContactEdge.prototype.set_other = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactEdge_set_other_1(self, arg0);
};
  b2ContactEdge.prototype['get_contact'] = b2ContactEdge.prototype.get_contact = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ContactEdge_get_contact_0(self), b2Contact);
};
    b2ContactEdge.prototype['set_contact'] = b2ContactEdge.prototype.set_contact = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactEdge_set_contact_1(self, arg0);
};
  b2ContactEdge.prototype['get_prev'] = b2ContactEdge.prototype.get_prev = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ContactEdge_get_prev_0(self), b2ContactEdge);
};
    b2ContactEdge.prototype['set_prev'] = b2ContactEdge.prototype.set_prev = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactEdge_set_prev_1(self, arg0);
};
  b2ContactEdge.prototype['get_next'] = b2ContactEdge.prototype.get_next = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2ContactEdge_get_next_0(self), b2ContactEdge);
};
    b2ContactEdge.prototype['set_next'] = b2ContactEdge.prototype.set_next = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2ContactEdge_set_next_1(self, arg0);
};
  b2ContactEdge.prototype['__destroy__'] = b2ContactEdge.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2ContactEdge___destroy___0(self);
};
// b2RopeJointDef
function b2RopeJointDef() {
  this.ptr = _emscripten_bind_b2RopeJointDef_b2RopeJointDef_0();
  getCache(b2RopeJointDef)[this.ptr] = this;
};;
b2RopeJointDef.prototype = Object.create(b2JointDef.prototype);
b2RopeJointDef.prototype.constructor = b2RopeJointDef;
b2RopeJointDef.prototype.__class__ = b2RopeJointDef;
b2RopeJointDef.__cache__ = {};
Module['b2RopeJointDef'] = b2RopeJointDef;

  b2RopeJointDef.prototype['get_localAnchorA'] = b2RopeJointDef.prototype.get_localAnchorA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJointDef_get_localAnchorA_0(self), b2Vec2);
};
    b2RopeJointDef.prototype['set_localAnchorA'] = b2RopeJointDef.prototype.set_localAnchorA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_localAnchorA_1(self, arg0);
};
  b2RopeJointDef.prototype['get_localAnchorB'] = b2RopeJointDef.prototype.get_localAnchorB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJointDef_get_localAnchorB_0(self), b2Vec2);
};
    b2RopeJointDef.prototype['set_localAnchorB'] = b2RopeJointDef.prototype.set_localAnchorB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_localAnchorB_1(self, arg0);
};
  b2RopeJointDef.prototype['get_maxLength'] = b2RopeJointDef.prototype.get_maxLength = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJointDef_get_maxLength_0(self);
};
    b2RopeJointDef.prototype['set_maxLength'] = b2RopeJointDef.prototype.set_maxLength = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_maxLength_1(self, arg0);
};
  b2RopeJointDef.prototype['get_type'] = b2RopeJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJointDef_get_type_0(self);
};
    b2RopeJointDef.prototype['set_type'] = b2RopeJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_type_1(self, arg0);
};
  b2RopeJointDef.prototype['get_userData'] = b2RopeJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2RopeJointDef_get_userData_0(self);
};
    b2RopeJointDef.prototype['set_userData'] = b2RopeJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_userData_1(self, arg0);
};
  b2RopeJointDef.prototype['get_bodyA'] = b2RopeJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJointDef_get_bodyA_0(self), b2Body);
};
    b2RopeJointDef.prototype['set_bodyA'] = b2RopeJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_bodyA_1(self, arg0);
};
  b2RopeJointDef.prototype['get_bodyB'] = b2RopeJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2RopeJointDef_get_bodyB_0(self), b2Body);
};
    b2RopeJointDef.prototype['set_bodyB'] = b2RopeJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_bodyB_1(self, arg0);
};
  b2RopeJointDef.prototype['get_collideConnected'] = b2RopeJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2RopeJointDef_get_collideConnected_0(self));
};
    b2RopeJointDef.prototype['set_collideConnected'] = b2RopeJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2RopeJointDef_set_collideConnected_1(self, arg0);
};
  b2RopeJointDef.prototype['__destroy__'] = b2RopeJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2RopeJointDef___destroy___0(self);
};
// b2MotorJointDef
function b2MotorJointDef() {
  this.ptr = _emscripten_bind_b2MotorJointDef_b2MotorJointDef_0();
  getCache(b2MotorJointDef)[this.ptr] = this;
};;
b2MotorJointDef.prototype = Object.create(b2JointDef.prototype);
b2MotorJointDef.prototype.constructor = b2MotorJointDef;
b2MotorJointDef.prototype.__class__ = b2MotorJointDef;
b2MotorJointDef.__cache__ = {};
Module['b2MotorJointDef'] = b2MotorJointDef;

b2MotorJointDef.prototype['Initialize'] = b2MotorJointDef.prototype.Initialize = function(arg0, arg1) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  if (arg1 && typeof arg1 === 'object') arg1 = arg1.ptr;
  _emscripten_bind_b2MotorJointDef_Initialize_2(self, arg0, arg1);
};;

  b2MotorJointDef.prototype['get_linearOffset'] = b2MotorJointDef.prototype.get_linearOffset = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJointDef_get_linearOffset_0(self), b2Vec2);
};
    b2MotorJointDef.prototype['set_linearOffset'] = b2MotorJointDef.prototype.set_linearOffset = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_linearOffset_1(self, arg0);
};
  b2MotorJointDef.prototype['get_angularOffset'] = b2MotorJointDef.prototype.get_angularOffset = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_angularOffset_0(self);
};
    b2MotorJointDef.prototype['set_angularOffset'] = b2MotorJointDef.prototype.set_angularOffset = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_angularOffset_1(self, arg0);
};
  b2MotorJointDef.prototype['get_maxForce'] = b2MotorJointDef.prototype.get_maxForce = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_maxForce_0(self);
};
    b2MotorJointDef.prototype['set_maxForce'] = b2MotorJointDef.prototype.set_maxForce = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_maxForce_1(self, arg0);
};
  b2MotorJointDef.prototype['get_maxTorque'] = b2MotorJointDef.prototype.get_maxTorque = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_maxTorque_0(self);
};
    b2MotorJointDef.prototype['set_maxTorque'] = b2MotorJointDef.prototype.set_maxTorque = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_maxTorque_1(self, arg0);
};
  b2MotorJointDef.prototype['get_correctionFactor'] = b2MotorJointDef.prototype.get_correctionFactor = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_correctionFactor_0(self);
};
    b2MotorJointDef.prototype['set_correctionFactor'] = b2MotorJointDef.prototype.set_correctionFactor = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_correctionFactor_1(self, arg0);
};
  b2MotorJointDef.prototype['get_type'] = b2MotorJointDef.prototype.get_type = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_type_0(self);
};
    b2MotorJointDef.prototype['set_type'] = b2MotorJointDef.prototype.set_type = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_type_1(self, arg0);
};
  b2MotorJointDef.prototype['get_userData'] = b2MotorJointDef.prototype.get_userData = function() {
  var self = this.ptr;
  return _emscripten_bind_b2MotorJointDef_get_userData_0(self);
};
    b2MotorJointDef.prototype['set_userData'] = b2MotorJointDef.prototype.set_userData = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_userData_1(self, arg0);
};
  b2MotorJointDef.prototype['get_bodyA'] = b2MotorJointDef.prototype.get_bodyA = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJointDef_get_bodyA_0(self), b2Body);
};
    b2MotorJointDef.prototype['set_bodyA'] = b2MotorJointDef.prototype.set_bodyA = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_bodyA_1(self, arg0);
};
  b2MotorJointDef.prototype['get_bodyB'] = b2MotorJointDef.prototype.get_bodyB = function() {
  var self = this.ptr;
  return wrapPointer(_emscripten_bind_b2MotorJointDef_get_bodyB_0(self), b2Body);
};
    b2MotorJointDef.prototype['set_bodyB'] = b2MotorJointDef.prototype.set_bodyB = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_bodyB_1(self, arg0);
};
  b2MotorJointDef.prototype['get_collideConnected'] = b2MotorJointDef.prototype.get_collideConnected = function() {
  var self = this.ptr;
  return !!(_emscripten_bind_b2MotorJointDef_get_collideConnected_0(self));
};
    b2MotorJointDef.prototype['set_collideConnected'] = b2MotorJointDef.prototype.set_collideConnected = function(arg0) {
  var self = this.ptr;
  if (arg0 && typeof arg0 === 'object') arg0 = arg0.ptr;
  _emscripten_bind_b2MotorJointDef_set_collideConnected_1(self, arg0);
};
  b2MotorJointDef.prototype['__destroy__'] = b2MotorJointDef.prototype.__destroy__ = function() {
  var self = this.ptr;
  _emscripten_bind_b2MotorJointDef___destroy___0(self);
};
(function() {
  function setupEnums() {
    

    // b2ShapeType

    Module['b2Shape']['e_circle'] = _emscripten_enum_b2ShapeType_e_circle();

    Module['b2Shape']['e_edge'] = _emscripten_enum_b2ShapeType_e_edge();

    Module['b2Shape']['e_polygon'] = _emscripten_enum_b2ShapeType_e_polygon();

    Module['b2Shape']['e_chain'] = _emscripten_enum_b2ShapeType_e_chain();

    Module['b2Shape']['e_typeCount'] = _emscripten_enum_b2ShapeType_e_typeCount();

    

    // b2JointType

    Module['e_unknownJoint'] = _emscripten_enum_b2JointType_e_unknownJoint();

    Module['e_revoluteJoint'] = _emscripten_enum_b2JointType_e_revoluteJoint();

    Module['e_prismaticJoint'] = _emscripten_enum_b2JointType_e_prismaticJoint();

    Module['e_distanceJoint'] = _emscripten_enum_b2JointType_e_distanceJoint();

    Module['e_pulleyJoint'] = _emscripten_enum_b2JointType_e_pulleyJoint();

    Module['e_mouseJoint'] = _emscripten_enum_b2JointType_e_mouseJoint();

    Module['e_gearJoint'] = _emscripten_enum_b2JointType_e_gearJoint();

    Module['e_wheelJoint'] = _emscripten_enum_b2JointType_e_wheelJoint();

    Module['e_weldJoint'] = _emscripten_enum_b2JointType_e_weldJoint();

    Module['e_frictionJoint'] = _emscripten_enum_b2JointType_e_frictionJoint();

    Module['e_ropeJoint'] = _emscripten_enum_b2JointType_e_ropeJoint();

    Module['e_motorJoint'] = _emscripten_enum_b2JointType_e_motorJoint();

    

    // b2LimitState

    Module['e_inactiveLimit'] = _emscripten_enum_b2LimitState_e_inactiveLimit();

    Module['e_atLowerLimit'] = _emscripten_enum_b2LimitState_e_atLowerLimit();

    Module['e_atUpperLimit'] = _emscripten_enum_b2LimitState_e_atUpperLimit();

    Module['e_equalLimits'] = _emscripten_enum_b2LimitState_e_equalLimits();

    

    // b2ManifoldType

    Module['b2Manifold']['e_circles'] = _emscripten_enum_b2ManifoldType_e_circles();

    Module['b2Manifold']['e_faceA'] = _emscripten_enum_b2ManifoldType_e_faceA();

    Module['b2Manifold']['e_faceB'] = _emscripten_enum_b2ManifoldType_e_faceB();

    

    // b2BodyType

    Module['b2_staticBody'] = _emscripten_enum_b2BodyType_b2_staticBody();

    Module['b2_kinematicBody'] = _emscripten_enum_b2BodyType_b2_kinematicBody();

    Module['b2_dynamicBody'] = _emscripten_enum_b2BodyType_b2_dynamicBody();

    

    // b2DrawFlag

    Module['b2Draw']['e_shapeBit'] = _emscripten_enum_b2DrawFlag_e_shapeBit();

    Module['b2Draw']['e_jointBit'] = _emscripten_enum_b2DrawFlag_e_jointBit();

    Module['b2Draw']['e_aabbBit'] = _emscripten_enum_b2DrawFlag_e_aabbBit();

    Module['b2Draw']['e_pairBit'] = _emscripten_enum_b2DrawFlag_e_pairBit();

    Module['b2Draw']['e_centerOfMassBit'] = _emscripten_enum_b2DrawFlag_e_centerOfMassBit();

    

    // b2ContactFeatureType

    Module['b2ContactFeature']['e_vertex'] = _emscripten_enum_b2ContactFeatureType_e_vertex();

    Module['b2ContactFeature']['e_face'] = _emscripten_enum_b2ContactFeatureType_e_face();

  }
  if (Module['calledRun']) setupEnums();
  else addOnPreMain(setupEnums);
})();


this['Box2D'] = Module; // With or without a closure, the proper usage is Box2D.*

