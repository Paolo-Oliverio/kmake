// Copyright 2021 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --wasm-speculative-inlining --experimental-wasm-return-call
// Flags: --experimental-wasm-typed-funcref --experimental-wasm-type-reflection
// Flags: --no-wasm-tier-up --wasm-dynamic-tiering --wasm-tiering-budget=100
// Flags: --allow-natives-syntax

// These tests check if functions are speculatively inlined as expected. We do
// not check automatically which functions are inlined. To get more insight, run
// with --trace-wasm-speculative-inlining, --trace-turbo, --trace-wasm and (for
// the last test only) --trace.

d8.file.execute("test/mjsunit/wasm/wasm-module-builder.js");

(function CallRefSpecSucceededTest() {
  print(arguments.callee.name);
  let builder = new WasmModuleBuilder();

  // f(x) = x - 1
  let callee = builder.addFunction("callee", kSig_i_i)
    .addBody([kExprLocalGet, 0, kExprI32Const, 1, kExprI32Sub]);

  let global = builder.addGlobal(wasmRefType(0), false,
                                 WasmInitExpr.RefFunc(callee.index));

  // g(x) = f(5) + x
  builder.addFunction("main", kSig_i_i)
    .addBody([kExprI32Const, 5, kExprGlobalGet, global.index, kExprCallRef,
              kExprLocalGet, 0, kExprI32Add])
    .exportAs("main");

  let instance = builder.instantiate();
  // Run 'main' until it is tiered-up.
  while (%IsLiftoffFunction(instance.exports.main)) {
    assertEquals(14, instance.exports.main(10));
  }
  // The tiered-up function should have {callee} speculatively inlined.
  assertEquals(14, instance.exports.main(10));
})();

(function CallRefSpecFailedTest() {
  print(arguments.callee.name);
  let builder = new WasmModuleBuilder();

  // h(x) = x - 1
  let callee0 = builder.addFunction("callee0", kSig_i_i)
    .addBody([kExprLocalGet, 0, kExprI32Const, 1, kExprI32Sub]);

  // f(x) = x - 2
  let callee1 = builder.addFunction("callee1", kSig_i_i)
    .addBody([kExprLocalGet, 0, kExprI32Const, 2, kExprI32Sub]);

  let global0 = builder.addGlobal(wasmRefType(1), false,
                                  WasmInitExpr.RefFunc(callee0.index));
  let global1 = builder.addGlobal(wasmRefType(1), false,
                                  WasmInitExpr.RefFunc(callee1.index));

  // g(x, y) = if (y) { h(5) + x } else { f(7) + x }
  builder.addFunction("main", kSig_i_ii)
    .addBody([
      kExprLocalGet, 1,
      kExprIf, kWasmI32,
        kExprI32Const, 5, kExprGlobalGet, global0.index, kExprCallRef,
        kExprLocalGet, 0, kExprI32Add,
      kExprElse,
        kExprI32Const, 7, kExprGlobalGet, global1.index, kExprCallRef,
        kExprLocalGet, 0, kExprI32Add,
      kExprEnd])
    .exportAs("main");

  let instance = builder.instantiate();

  // Run 'main' until it is tiered-up.
  while (%IsLiftoffFunction(instance.exports.main)) {
    assertEquals(14, instance.exports.main(10, 1));
  }
  // Tier-up is done, and {callee0} should be inlined in the trace.
  assertEquals(14, instance.exports.main(10, 1))

  // Now, run main with {callee1} instead. The correct reference should still be
  // called after inlining.
  assertEquals(15, instance.exports.main(10, 0));
})();

(function CallReturnRefSpecSucceededTest() {
  print(arguments.callee.name);
  let builder = new WasmModuleBuilder();

  // f(x) = x - 1
  let callee = builder.addFunction("callee", kSig_i_i)
    .addBody([kExprLocalGet, 0, kExprI32Const, 1, kExprI32Sub]);

  let global = builder.addGlobal(wasmRefType(0), false,
                                 WasmInitExpr.RefFunc(callee.index));

  // g(x) = f(5 + x)
  builder.addFunction("main", kSig_i_i)
    .addBody([kExprI32Const, 5, kExprLocalGet, 0, kExprI32Add,
              kExprGlobalGet, global.index, kExprReturnCallRef])
    .exportAs("main");

  let instance = builder.instantiate();
  // Run 'main' until it is tiered-up.
  while (%IsLiftoffFunction(instance.exports.main)) {
    assertEquals(14, instance.exports.main(10));
  }
  // After tier-up, the tail call should be speculatively inlined.
  assertEquals(14, instance.exports.main(10));
})();

(function CallReturnRefSpecFailedTest() {
  print(arguments.callee.name);
  let builder = new WasmModuleBuilder();

  // h(x) = x - 1
  let callee0 = builder.addFunction("callee0", kSig_i_i)
    .addBody([kExprLocalGet, 0, kExprI32Const, 1, kExprI32Sub]);

  // f(x) = x - 2
  let callee1 = builder.addFunction("callee1", kSig_i_i)
    .addBody([kExprLocalGet, 0, kExprI32Const, 2, kExprI32Sub]);

  let global0 = builder.addGlobal(wasmRefType(1), false,
                                 WasmInitExpr.RefFunc(callee0.index));
  let global1 = builder.addGlobal(wasmRefType(1), false,
                                 WasmInitExpr.RefFunc(callee1.index));

  // g(x, y) = if (y) { h(x) } else { f(x) }
  builder.addFunction("main", kSig_i_ii)
    .addBody([
      kExprLocalGet, 1,
      kExprIf, kWasmI32,
        kExprLocalGet, 0, kExprGlobalGet, global0.index, kExprReturnCallRef,
      kExprElse,
        kExprLocalGet, 0, kExprGlobalGet, global1.index, kExprReturnCallRef,
      kExprEnd])
    .exportAs("main");

  let instance = builder.instantiate();
  // Run 'main' until it is tiered-up.
  while (%IsLiftoffFunction(instance.exports.main)) {
    assertEquals(9, instance.exports.main(10, 1));
  }
  // After tier-up, {callee0} should be inlined in the trace.
  assertEquals(9, instance.exports.main(10, 1))

  // Now, run main with {callee1} instead. The correct reference should still be
  // called.
  assertEquals(8, instance.exports.main(10, 0));
})();

(function CallRefImportedFunction() {
  print(arguments.callee.name);

  let instance1 = function() {
    let builder = new WasmModuleBuilder();

    let f1 = builder.addImport("m", "i_f1", kSig_i_i);
    let f2 = builder.addImport("m", "i_f2", kSig_i_i);

    builder.addExport("f1", f1);
    builder.addExport("f2", f2);

    return builder.instantiate({m : { i_f1 : x => x + 1, i_f2 : x => x + 2}});
  }();

  let instance2 = function() {
    let builder = new WasmModuleBuilder();

    let sig1 = builder.addType(kSig_i_i);
    let sig2 = builder.addType(kSig_i_ii);

    builder.addFunction("callee", sig2)
      .addBody([kExprLocalGet, 0, kExprLocalGet, 1, kExprI32Add])
      .exportFunc();

    builder.addFunction("main", makeSig([kWasmI32,
                                         wasmRefType(sig1)], [kWasmI32]))
      .addBody([kExprLocalGet, 0, kExprLocalGet, 1, kExprCallRef])
      .exportFunc();

    return builder.instantiate({});
  }();

  // Run 'main' until it is tiered-up.
  while (%IsLiftoffFunction(instance2.exports.main)) {
    assertEquals(1, instance2.exports.main(0, instance1.exports.f1));
  }
  // The function f1 defined in another module should not be inlined.
  assertEquals(1, instance2.exports.main(0, instance1.exports.f1));
})();

// Check that we handle WasmJSFunctions properly and do not inline them, both
// in the monomorphic and polymorphic case.
(function CallRefWasmJsFunction() {
  print(arguments.callee.name);

  let f1 = new WebAssembly.Function({parameters: ["i32"], results: ["i32"]},
                                    x => x + 1);
  let f2 = new WebAssembly.Function({parameters: ["i32"], results: ["i32"]},
                                    x => x * 2);

  let instance2 = function() {
    let builder = new WasmModuleBuilder();

    let sig = builder.addType(kSig_i_i);

    builder.addFunction("main", makeSig(
        [kWasmI32, wasmRefType(sig), wasmRefType(sig)], [kWasmI32]))
      .addBody([kExprLocalGet, 0, kExprLocalGet, 1, kExprCallRef,
                kExprLocalGet, 0, kExprLocalGet, 2, kExprCallRef,
                kExprI32Add])
      .exportFunc();

    return builder.instantiate({});
  }();

  var i = 0;
  // Run 'main' until it is tiered-up. The first argument should try to be
  // spec-inlined monomorphically. We pass f2 to the second argument 80% of the
  // time, so it should try to be spec-inlined polymorphically.
  while (%IsLiftoffFunction(instance2.exports.main)) {
    if (i % 5 == 0) {
      assertEquals(12, instance2.exports.main(5, f1, f1));
    } else {
      assertEquals(16, instance2.exports.main(5, f1, f2));
    }
    i++;
  }
  // WebAssembly.Function objects should not be inlined.
  assertEquals(16, instance2.exports.main(5, f1, f2));
  assertEquals(12, instance2.exports.main(5, f1, f1));
})();
