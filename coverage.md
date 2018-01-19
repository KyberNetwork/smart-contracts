with all new tests.

coverage run:
https://gist.github.com/ilanDoron/54bf64fbbe1b75ffc38f6ef9837e2fd9

Our coverage result can be found here
https://github.com/KyberNetwork/smart-contracts/files/1644882/coverage.zip

coverage was run with 2 changes in code: (for coverage only)
1. removing two lines in default payable function in kyberNetwork.
2. in ERC20Interface. change from interface to contract.

following tests fail - fixes already exist in our new code:
some fail only in coverage run. due to modifications the coverage tool makes (4-5 out of 16).

167 passing (2m)
  16 failing

  1) Contract: ExpectedRates should test can't init expected rate with empty contracts (address 0).:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/expectedRate.js:198:13)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  2) Contract: FeeBurner should test can't init this contract with empty contracts (address 0).:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/feeBurner.js:169:13)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  3) Contract: FeeBurner should test can't set bps fee > 1% (100 bps) and can't set empty knc wallet.:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/feeBurner.js:208:13)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  4) Contract: FeeBurner should test send fees to wallet reverted when balance is 'zeroed' == 1.:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/feeBurner.js:250:13)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  5) Contract: KyberNetwork should test low 'max dest amount' on sell. make sure it reduces source amount.:
     Error: VM Exception while processing transaction: revert
      at Object.InvalidResponse (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:41484:16)
      at /usr/local/lib/node_modules/truffle/build/cli.bundled.js:329530:36
      at /usr/local/lib/node_modules/truffle/build/cli.bundled.js:325200:9
      at XMLHttpRequest.request.onreadystatechange (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:328229:7)
      at XMLHttpRequestEventTarget.dispatchEvent (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176415:18)
      at XMLHttpRequest._setReadyState (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176705:12)
      at XMLHttpRequest._onHttpResponseEnd (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176860:12)
      at IncomingMessage.<anonymous> (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176820:24)

  6) Contract: KyberNetwork should test low 'max dest amount' on buy. make sure it reduces source amount.:
     Error: VM Exception while processing transaction: revert
      at Object.InvalidResponse (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:41484:16)
      at /usr/local/lib/node_modules/truffle/build/cli.bundled.js:329530:36
      at /usr/local/lib/node_modules/truffle/build/cli.bundled.js:325200:9
      at XMLHttpRequest.request.onreadystatechange (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:328229:7)
      at XMLHttpRequestEventTarget.dispatchEvent (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176415:18)
      at XMLHttpRequest._setReadyState (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176705:12)
      at XMLHttpRequest._onHttpResponseEnd (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176860:12)
      at IncomingMessage.<anonymous> (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176820:24)

  7) Contract: KyberNetwork should verify trade reverted when gas price above set max.:
     AssertionError: expected throw but got: Error: Error: sender doesn't have enough funds to send tx. The upfront cost is: 1759218604441500000000004 and the sender's account only has: 99999999999947666118
    at runCall (/home/iland/myProjects/kyberaudit/smart-contracts/node_modules/ethereumjs-testrpc-sc/build/cli.node.js:70991:10)
    at /home/iland/myProjects/kyberaudit/smart-contracts/node_modules/ethereumjs-testrpc-sc/build/cli.node.js:12656:24
    at replenish (/home/iland/myProjects/kyberaudit/smart-contracts/node_modules/ethereumjs-testrpc-sc/build/cli.node.js:9788:17)
    at iterateeCallback (/home/iland/myProjects/kyberaudit/smart-contracts/node_modules/ethereumjs-testrpc-sc/build/cli.node.js:9773:17)
    at /home/iland/myProjects/kyberaudit/smart-contracts/node_modules/ethereumjs-testrpc-sc/build/cli.node.js:9748:16
    at /home/iland/myProjects/kyberaudit/smart-contracts/node_modules/ethereumjs-testrpc-sc/build/cli.node.js:12661:13
    at /home/iland/myProjects/kyberaudit/smart-contracts/node_modules/ethereumjs-testrpc-sc/build/cli.node.js:67133:16
    at replenish (/home/iland/myProjects/kyberaudit/smart-contracts/node_modules/ethereumjs-testrpc-sc/build/cli.node.js:67080:25)
    at /home/iland/myProjects/kyberaudit/smart-contracts/node_modules/ethereumjs-testrpc-sc/build/cli.node.js:67089:9
    at eachLimit (/home/iland/myProjects/kyberaudit/smart-contracts/node_modules/ethereumjs-testrpc-sc/build/cli.node.js:67013:36)
      at Context.<anonymous> (test/kyberNetwork.js:741:13)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  8) Contract: KyberNetwork should verify trade reverted when rate above max rate.:
     Error: VM Exception while processing transaction: revert
      at Object.InvalidResponse (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:41484:16)
      at /usr/local/lib/node_modules/truffle/build/cli.bundled.js:329530:36
      at /usr/local/lib/node_modules/truffle/build/cli.bundled.js:325200:9
      at XMLHttpRequest.request.onreadystatechange (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:328229:7)
      at XMLHttpRequestEventTarget.dispatchEvent (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176415:18)
      at XMLHttpRequest._setReadyState (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176705:12)
      at XMLHttpRequest._onHttpResponseEnd (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176860:12)
      at IncomingMessage.<anonymous> (/usr/local/lib/node_modules/truffle/build/cli.bundled.js:176820:24)

  9) Contract: KyberNetwork should verify trade reverted when dest address 0.:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/kyberNetwork.js:894:13)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  10) Contract: KyberNetwork should verify same reserve can't be added twice.:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/kyberNetwork.js:921:13)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  11) Contract: KyberNetwork should remove reserves and verify reserve array length is 0.:
     AssertionError: unexpected number of reserves.: expected '3' to equal 2
      at Context.<anonymous> (test/kyberNetwork.js:933:16)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  12) Contract: KyberNetwork should test can't init this contract with empty contracts (address 0).:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/kyberNetwork.js:954:13)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  13) Contract: KyberReserve should test can't init this contract with empty contracts (address 0).:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/kyberReserve.js:824:12)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  14) Contract: SanityRates should test can't init this contract with empty contracts (address 0).:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/sanityRates.js:67:12)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  15) Contract: VolumeImbalanceRecorder should test can't init this contract with empty contracts (address 0).:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/volumeImbalanceRecorder.js:412:12)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)

  16) Contract: WhiteList should test can't init this contract with empty contracts (address 0).:
     AssertionError: expected throw but got: AssertionError: throw was expected in line above.
      at Context.<anonymous> (test/whitelist.js:81:12)
      at <anonymous>
      at process._tickCallback (internal/process/next_tick.js:188:7)


