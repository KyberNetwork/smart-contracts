# Integration with Kyber Network
This document describes how a third party wallet/exchange can perform an exchange deal
with kyber network smart contract.
The api we describe should be viewed at this point only as a reference.
Changes are still expected before the mainnet launch.

A wallet/exchange service interacts with the contract in three ways:
1. Rate query: queries the offered price of, e.g., GNO to ETH conversion.
2. Trade execution: e.g., convert X GNO to Y ETH.
3. Checks if user is allowed to use the exchange services and the maximum amount he can trade.
4. Checks the network state. Initially it might be down for maintanance in extreme cases.
5. Checks user max gas price.

We describe the api for each bellow:

## Rate query
To query the conversion rate, one should call this function
```
    function getExpectedRate(ERC20 source, ERC20 dest, uint srcQty) public view
        returns (uint expectedPrice, uint slippagePrice);
```
The function returns the expected and worse case conversion rate between `source` and `dest` tokens,
where `source` and `dest` are 20 bytes addresses.
Use address `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` to denote Ether.

For example, if user wants to sell GNO tokens in return to ETH, he should set
`source = 0x6810e776880c02933d47db1b9fc05908e5386b96` and
`dest = 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`.
In return to 1 GNO token he is expected to receive
`expectedPrice / 10**18` ETH, but in the worse case scenario he will get only `slippagePrice/10**18` ETH.

If he wants to buy GNO with ETH, he should set
`source =  0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`, and
`dest = 0x6810e776880c02933d47db1b9fc05908e5386b96`.

A return value of `0` indicates that an exchange from `source` to `dest` is
currently not available.
A value of `0` in the slippage price indicates that transaction might be reverted and not completed.
We note that the worst case scenario is always for the transaction to be reverted due to either sudden change in rates or even inventory depletion, but these events are rare.

## Trade execution
To make an exchange, one should call
```
    function trade(
        ERC20 source,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId
    )
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
For an exchange application this value can be set according to the `priceSlippage` return value of
`getExpectedRate`. However, in this case, the execution of the transaction is not guaranteed
in case big changes in market price happens before the confirmation of the transaction.
A value of `1` will execute the trade according to market price in the time
of the transaction confirmation.
7. `walletId`: the id of the service provider. Should be determined along with
kyber network. If you are not sure what to put here, just put `0`.


## User eligibility
Different users might have different maximal trade amount they can use.
For example, in the future, users who did full KYC with kyber might be allowed to trade higher amounts.
Also, during the initial pilot launch, only selected users (e.g., KGT holders) will be allowed to participate.
For this purpose, every user (Ethereum account) has a cap of the maximal ETH he can trade in a single trade.
A maximal amount of 0 ETH means the user cannot use the exchange at all (applicable mainly in the first pilot period).
In this ropsten deployment, the default user limitation is 10 ETH.

When converting ETH to token, the amount of ETH should not exceed the maximal amount. When converting token to ETH, the received ETH amount should not exceed the maximal amount.
If the amount exceed the maximal amount, the tx is reverted.
As conversion rate is not fully known before tx is approved, when converting to ETH, it is recommended to make sure the expected amount does not exceed 95% of the maximal user limitation.

To get user cap (max trade size) one should call:
```
function getUserCapInWei(address user)
```
the return value is user ETH cap in wei units.
In the current ropsten deployment, every address has a cap of 10 ETH.

## Network state
In extreme case, or when upgrading the contract the network might be disabled by the network admin and all trades are disabled.
The status can be fetched by reading the public variable `enable`. Please note that in the non-ropsten deployment it is renamed to `enabled`.

## User max gas price
To prevent user front running, the contract limits the gas price user can have.
If the user send a transaction with higher gas price the transaction is reverted.
This limited can be queried from the public variable `maxGasPrice`.
A typical value would be 100000000000, which stands for 100 gwei.

# Current deployment
The contract is currently deployed on Ethereum mainnet and Ropsten testnet.
The mainnet contract address is [`kybernetwork.eth`](https://etherscan.io/address/kybernetwork.eth).

The ropsten addresses can be found [here](https://github.com/KyberNetwork/smart-contracts/blob/master/web3deployment/ropsten.json).
For wallets the relevant addresses are those of kyber network contract and the token addresses.
The kyber network contract address can be found [here](https://github.com/KyberNetwork/smart-contracts/blob/master/web3deployment/ropsten.json#L393), while the token addresses are [here](https://github.com/KyberNetwork/smart-contracts/blob/master/web3deployment/ropsten.json#L3).

The contracts source code and abi are also available at etherscan.
