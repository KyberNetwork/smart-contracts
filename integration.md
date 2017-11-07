# Integration with Kyber Network
This document describes how a third party wallet/exchange can perform an exchange deal
with kyber network smart contract.
The api we describe should be viewed at this point only as a reference.
Changes are still expected before the mainnet launch.

A wallet/exchange service interacts with the contract in two ways:
1. Price query: queries the offered price of, e.g., GNO to ETH conversion.
2. Trade execution: e.g., convert X GNO to Y ETH

We describe the api for each bellow:

## Price query
To query the conversion rate, one should call this function
```
function getPrice( ERC20 source, ERC20 dest ) constant returns(uint)
```
The function returns the conversion rate between `source` and `dest` tokens,
where `source` and `dest` are 20 bytes addresses.
Use address `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` to denote Ether.

For example, if user wants to sell GNO tokens in return to ETH, he should set
`source = 0x6810e776880c02933d47db1b9fc05908e5386b96` and
`dest = 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`.
In return to 1 GNO token he will receive
`getPrice(0x6810e776880c02933d47db1b9fc05908e5386b96,0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee)` ETH.

If he wants to buy GNO with ETH, he should set
`source =  0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`, and
`dest = 0x6810e776880c02933d47db1b9fc05908e5386b96`.

A return value of `0` indicates that an exchange from `source` to `dest` is
currently not available.
This could be either because kyber network does not support an exchange between such pair,
or because the reserve supply is temporarily depleted (this is a rare event).

## Trade execution
To make an exchange via wallet application, one should call
```
function walletTrade( ERC20 source, uint srcAmount,
                ERC20 dest, address destAddress, uint maxDestAmount,
                uint minConversionRate,
                bool throwOnFailure,
                bytes32 walletId ) payable returns(uint)
```
In general, this function convert `source` token to `dest` token and send it
to `destAddress`.
We now describe the function parameters with more details:
1. `source`: the address of the source token. Where `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` stands for ETH. If the source token is ETH, then `msg.value` should be equal to `srcAmount`.
I.e., the user must send the amount he wishes to convert when calling the function.
Otherwise, the user must `approve` a sufficient amount (i.e., at least `srcAmount`) of tokens
to kyber network contract address. This is done in a separate call to `approve` function
of the relevant token.
2. `srcAmount`: amount of tokens to convert. If sending ETH must be equal to `msg.value`.
Otherwise, must not be higher than user token allowance to kyber network contract address.
3. `dest`: the address of the destination source. Where `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` stands for ETH.
4. `destAddress`: the address that will receive the converted token.
For an exchange application, we recommend to set
`destAddress = msg.sender`.
5. `maxDestAmount`: maximum destination amount.
The actual converted amount will be the minimum of `srcAmount` and required amount
to get `maxDestAmount` of `dest` tokens.
For an exchange application, we recommend to set it to `MAX_UINT` (i.e., `2**256 - 1`).
6. `minConversionRate`: the minimal conversion rate. If the current rate is too high, then the
transaction is reverted.
For an exchange application this value can be set according to the current return value of
`getPrice`. However, in this case, the execution of the transaction is not guaranteed
in case of changes in market price before the confirmation of the transaction.
A value of `1` will execute the trade according to market price in the time
of the transaction confirmation.
7. `throwOnFailure`: indicates if transaction is reverted in the case of a failure.
For an exchange application we recommend to set it to `true`.
8. `walletId`: the id of the service provider. Should be determined along with
kyber network.

# Current testnet deployment
The contract is currently depolyed on kovan testnet, and unofficially also at rinkeby.
The addresses can be found [here](https://github.com/KyberNetwork/smart-contracts/blob/master/deployment.txt).

The contracts source code and abi are also available at kovan (rinkeby) etherscan.
