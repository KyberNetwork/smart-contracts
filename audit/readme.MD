# KyberNetwork Smart Contracts Audit Report

## Preamble
This audit report was undertaken by **BlockchainLabs.nz** for the purpose of providing feedback to **Kyber.Network**.

It has subsequently been shared publicly without any express or implied warranty.

Solidity contracts were sourced from the public Github repo [KyberNetwork/smart-contracts](https://github.com/KyberNetwork/smart-contracts) at this commit [7c1170407b2dd6df061c9648c2ec9955d7cb6089](https://github.com/KyberNetwork/smart-contracts/tree/7c1170407b2dd6df061c9648c2ec9955d7cb6089) - we would encourage all community members and token holders to make their own assessment of the contracts.

## Scope
The following contracts were subject for static, dynamic and functional analyses:

- [KyberNetwork.sol](https://github.com/KyberNetwork/smart-contracts/blob/7c1170407b2dd6df061c9648c2ec9955d7cb6089/contracts/KyberNetwork.sol)
- [KyberReserve.sol](https://github.com/KyberNetwork/smart-contracts/blob/7c1170407b2dd6df061c9648c2ec9955d7cb6089/contracts/KyberReserve.sol)
- [ConversionRates.sol](https://github.com/KyberNetwork/smart-contracts/blob/7c1170407b2dd6df061c9648c2ec9955d7cb6089/contracts/ConversionRates.sol)
- [ExpectedRate.sol](https://github.com/KyberNetwork/smart-contracts/blob/7c1170407b2dd6df061c9648c2ec9955d7cb6089/contracts/ExpectedRate.sol)
- [FeeBurner.sol](https://github.com/KyberNetwork/smart-contracts/blob/7c1170407b2dd6df061c9648c2ec9955d7cb6089/contracts/FeeBurner.sol)
- [VolumeImbalanceRecorder.sol](https://github.com/KyberNetwork/smart-contracts/blob/7c1170407b2dd6df061c9648c2ec9955d7cb6089/contracts/VolumeImbalanceRecorders.sol)

## Focus areas
The audit report is focused on the following key areas - though this is not an exhaustive list.

### Correctness
- No correctness defects uncovered during static analysis?
- No implemented contract violations uncovered during execution?
- No other generic incorrect behaviour detected during execution?
- Adherence to adopted standards such as ERC20?

### Testability
- Test coverage across all functions and events?
- Test cases for both expected behaviour and failure modes?
- Settings for easy testing of a range of parameters?
- No reliance on nested callback functions or console logs?
- Avoidance of test scenarios calling other test scenarios?

### Security
- No presence of known security weaknesses?
- No funds at risk of malicious attempts to withdraw/transfer?
- No funds at risk of control fraud?
- Prevention of Integer Overflow or Underflow?

### Best Practice
- Explicit labeling for the visibility of functions and state variables?
- Proper management of gas limits and nested execution?
- Latest version of the Solidity compiler?

## Analysis

- [Functional Analysis](Kovan_tests.MD)
- [Test Coverage](test-coverage.MD)
- [Work Paper](work-paper.MD)

## Issues

### Severity Description
<table>
<tr>
  <td>Minor</td>
  <td>A defect that does not have a material impact on the contract execution and is likely to be subjective.</td>
</tr>
<tr>
  <td>Moderate</td>
  <td>A defect that could impact the desired outcome of the contract execution in a specific scenario.</td>
</tr>
<tr>
  <td>Major</td>
  <td> A defect that impacts the desired outcome of the contract execution or introduces a weakness that may be exploited.</td>
</tr>
<tr>
  <td>Critical</td>
  <td>A defect that presents a significant security vulnerability or failure of the contract across a range of scenarios.</td>
</tr>
</table>

### Minor
- **Shouldn't be possible to set a rate 0** - `Bug` In the `Whitelist.sol` contract, the `setSgdToEthRate` takes a parameter `_sgdToWeiRate` and assigns it's value to the public variable `weiPerSgd` *without* checking that it might be 0 and set all subsequent whitelistings' caps to 0. [#L40](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/blob/audit2/contracts/WhiteList.sol#L40])  [View on GitHub](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/issues/7)

- **Non standardised Naming** - `Correctness` In the `Whitelist.sol` contract, the `setSgdToEthRate` takes a parameter `_sgdToWeiRate`and assigns it's value to the public variable `weiPerSgd`. These naming conventions for such a simple setter function change too much and might lead to a mistake in reading it or using it.  [View on GitHub](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/issues/6)

- **All of the permissions are handled in the same file.** - `Gas optimization` All the logic is loaded in contracts even when they only use a portion of the code. Some contracts only need to know about `admin`, others only about `alerters` and others only about `operators` We suggest having the logic split into different files under one folder and only request what is needed.  [View on GitHub](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/issues/5)

- **No validation on for value in setQuantityFactor setter function** - `Question` `setQuantityFactor` in `ExpectedRate.sol` has no validation of the `newFactor` value which is input by an operator. Is there an upper or lower bound for this value? [#L25-L28](https://github.com/KyberNetwork/smart-contracts/blob/audit2/contracts/ExpectedRate.sol#L25-L28])  [View on GitHub](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/issues/4)

- **Setter function, setMinSlippageFactor, validates the existing value, not the new value** - `Bug` `setMinSlippageFactor()` in `ExpectedRate.sol` checks that the value of the current `minSlippageFactorInBps` value is valid, but does not check the operator inputted value, `bps`. [#L33](https://github.com/KyberNetwork/smart-contracts/blob/audit2/contracts/ExpectedRate.sol#L33])  [View on GitHub](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/issues/3)

- **The getRate function could be a bit more DRY** - `Best practice` For example this line [#L219](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/blob/audit2/contracts/ConversionRates.sol#L219]) There is a function `getBasicRate` which could be used the `rate = ...` line doesn't need to be included twice. You can expand this basic principle more to make the big `if (buy) { ...` case less intimidating with less repeating. This is a very minor issue and does not effect the security on the contract.  [View on GitHub](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/issues/2)

- **recordImbalance function has unnecessary return** - `Best practice` [#L192](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/blob/audit2/contracts/ConversionRates.sol#L192]) The function does not have a return value so adding a return statement is unneeded, and potentially confusing because one would assume that the `addBalance` function being called on the return line would return a value, which it doesn't either. This issue is very minor and does not effect the security of the contract.  [View on GitHub](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/issues/1)

### Moderate
- **It's possible for a malicious Kyber Admin to list "phishing" tokens** -  For example, an admin could create a new "OMG" token and their own reserve. If they set the price lower than actual `OMG` tokens then some people would make trades for an essentially worthless token. This is mostly a front-end issue, as you could display the token address so you can confirm the authenticity of the tokens you are exchanging.  [View on GitHub](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/issues/8)

### Major
- **A malicious admin could deploy a malicious Feeburner Contract** -  The FeeBurner Contract could be changed to burn all of the `KNC` tokens of a reserve by modifying `burnReserveFees` and registering the new contract in the network.  [View on GitHub](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/issues/9)

### Critical
- None found


## Observations

During our audit we kept in mind this central statement:

_"Provided that the users input reflects the users intent - i.e., min conversion rate, and the token address is of a reputable token, then even if network admin is malicious, user funds (beside gas costs) are never at risk"_

One of the issues we found was around a malicious admin deploying a fake token, from the previous statement we can ignore this issue and assume there will be a front end solution for the user to confirm they always have the correct token address.

A concering issue is [this one](https://github.com/BlockchainLabsNZ/KyberNetwork-contracts/issues/9), a malicious admin could potentially burn the supply of a users KNC tokens.

The issues we spotted were to do with a Kyber admin being malicious, not the Reserve Operators, we could not find any exploits for them to take a users tokens or ETH. To get around these issues we would suggest splitting out the `KyberNetwork::setParams()` function into multiple functions and applying a different privilege level for the more important parameters. Another option would be to require a Multi-Signature account to be in charge of those potentially dangerous calls.

To be a truly decentralized exchange, the control should probably not be in the admins hands at all, in order to do something like changing a system contract address may be better managed by requiring a redeployment of the entire Kyber Network as well as convincing users that this is a good idea.

The overall quality of the code base is very impressive and the developers are clearly experienced with Solidity.

## Conclusion
The developers demonstrated a great understanding of Solidity and smart contracts. They were receptive to the feedback provided to help improve the robustness of the contracts.

We took part in carefully reviewing all source code provided, including both static and dynamic testing methodology.

Overall we consider the resulting contracts following the audit feedback period adequate and have not identified any critical vulnerabilities that would endanger a users ETH, but we have noted some potential for malicious Kyber admins to drain KNC balances. This contract has a low level risk of ETH or other Tokens being hacked or stolen from the inspected contracts by third parties.

___

### Disclaimer

Our team uses our current understanding of the best practises for Solidity and Smart Contracts. Development in Solidity and for Blockchain is an emergering area of software engineering which still has a lot of room to grow, hence our current understanding of best practise may not find all of the issues in this code and design.

We have not analysed any of the assembly code generated by the Solidity compiler. We have not verified the deployment process and configurations of the contracts. We have only analysed the code outlined in the scope. We have not verified any of the claims made by any of the organisations behind this code.

Security audits do not warrant bug-free code. We encourge all users interacting with smart contract code to continue to analyse and inform themselves of any risks before interacting with any smart contracts.

