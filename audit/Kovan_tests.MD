# Kovan Network Function testing

## Deployed Contracts

Admin
0xDA1834a90fEFc1620318Ae9A80Ad2627C1c6fff5

Operator
0xFC2610fD2423EE2CBAFbCBdcE2Ea822796dE7Cc5

KyberNetwork
0x94b420138e829Bbf65F24c1273967C180133BB43

KyberReserve
0x85A6763Fe323bAc4c123f582f160A8e7D1251357

ConversionRates
0xeC3BDF03Ab3e9e9b671f2e242739F02EA9e95A57

Wrapper
0x64239f51CAbdE0c3342d774fe408AA23b7b7fE22
```
Error! Unable to verify source code
Exception #1 Occured: ERROR|The Contract solidity compilation has exceeded the maximum timeout/memory limit that we can safely process. Automated source code verification is unavailable for this source code.
```

WhiteList
0x8b78b47de8be70aebaabb706ad0d53ea377cb10e

feeburner
0x97AC20d3589FbD51401379647d859bD006009bA0

### Tests

Tried to set Base Rate for OMG Token from an account that isn't an operator
(Reverted)
- [x] https://kovan.etherscan.io/tx/0xbdc34956f310eb294777ee30a7e01ccc1a9cce1c16cce973112428694e8c291a

Set Base Rate for OMG Token as an operator
- [x] https://kovan.etherscan.io/tx/0xfe2154814d83b5fa298a72e8fb34d09f740c4582c847c9c60c938939aaa51912

Tried to purchase OMG Tokens
(Ran out of gas)
- [x] https://kovan.etherscan.io/tx/0xae80bb01dea8e1577d76e08a5a9c8ed9326c9c2f3d7efb3a1044d545d8e8ab6b

Deposited ETH to the reserve
- [x] https://kovan.etherscan.io/tx/0xec2aa6b2d9cde377c0368feb9a832ddd487681a3fb914d961c93d735149dc252

Set the Valid Rate Duration on the ConversionRates contract (to 10000 blocks for testing)
- [x] https://kovan.etherscan.io/tx/0x9ef37a059a3d35c4aae1a8d5d00f89c423a4f1395f16f2675976662cefe58935

Set Base Rate for SNT tokens. Base Buy : 123, Base Sell : 321
- [x] https://kovan.etherscan.io/tx/0x4e75cf9a100a0d444f1c1f48eaad72f9d58a93b45e30392256673c9869788266

Listing new pair for reserve. BLABS token to ETH
- [x] https://kovan.etherscan.io/tx/0x8411d5a77533e6bec757d27fce4ab31f9732d0d2be4b63e678cb492a32f94b7d

Listing new pair for reserve. ETH to BLABS token
- [x] https://kovan.etherscan.io/tx/0xa0fd3aa56df30e72262fec703b078d1594cd0ab78f82da0e37d9461c685a25d7

Adding new token to ConversionRates contract
- [x] https://kovan.etherscan.io/tx/0x1cc473f09312c1425b5e79a3a5c62650337873242f9754961f50a5735522720a

Setting Token Control Info in ConversionRates contract
BLABSCoin, MinimalRecordResolution: 1000, maxPerBlockImbalance: 250000000, maxTotalImbalance: 370000000
- [x] https://kovan.etherscan.io/tx/0xf3549a91e9d28e005e2c3e3333d2f3530095ed83b827146390c4ea068bed980f

Enabled Token Trading for BLABSCoin
- [x] https://kovan.etherscan.io/tx/0x5c052bcc43a8dbfe629e8a1859e7eacd3655eb3adb05aadad2e5803eea844fd1

Set the Quantity Step function for BLABSCoin
- [x] https://kovan.etherscan.io/tx/0xac1806141346ab6b64041d74cbe2fc951f28a1faa55358985470a84760c557f5

Set the Imbalance Step function for BLABSCoin
- [x] https://kovan.etherscan.io/tx/0xda2c461f29d21efa2840a9d09683ff934e752f68dfade0b2026ceee7bd2c6441

Set the BaseRate for BLABSCoin. BaseBuy: 100, BaseSell: 200, Buy: 0x1, Sell: 0x2, Indices
- [x] https://kovan.etherscan.io/tx/0x98e7770e52247dd6a6c45bc4298cafbdad5762e47a88fda8a16c8dc378fe413f

Deployed a new FeeBurner contract because I needed to deploy a new BurnableToken to burn for fees
(New "KNC" Token 0x3ddf45d413ccdc9c08fea1bcb6c8e5282c2e00c9)
- [x] https://kovan.etherscan.io/address/0x60e40E0a782b2Ec9a189F1e62D272ee4Db4f425a

Trade with KyberNetwork. Buying BLABS Coin for ETH
- [x] https://kovan.etherscan.io/tx/0x253e71217cc4c4e8310ccb3a236bae7fe7af9fbc8d3ba9011893aa6a847ee61b
