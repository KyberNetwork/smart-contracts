This repository has the main contracts in KyberNetwork platform. There are three main components in this repository including KyberNetwork contract, KyberReserve and KyberWallet contracts. In addition, we have a couple of mock modules that simulate testnet tokens and centralized exchanges.
This repository is for testing purposes only,  do not use it for real deployment.

Kindly refer to the developer portal at https://developer.kyber.network for documentation and guides with respect to our KyberNetwork and KyberReserve contracts.

# Kyber wallet contract
Kyber wallet integrates with existing Kyber Network.
A user needs to deploy [this](https://github.com/KyberNetwork/smart-contracts/blob/master/contracts/KyberWallet.sol) contract with c'tor param
`_kyberNetwork = 0x11542d7807dfb2b44937f756b9092c76e814f8ed`.
Then user should send ether and/or tokens to the contract. It can be in a standard way (just `send` or `transfer` ether or tokens to contract address).

The function to call is 
```
    function convertAndCall( ERC20 srcToken, uint srcAmount,
                             ERC20 destToken, uint maxDestAmount,
                             uint minRate,
                             address destination,
                             bytes   destinationData,
                             bool onlyApproveTokens,
                             bool throwOnFail ) {
```
If `onlyApproveTokens = true` and `destToken` is not ETH, then function does not transfer tokens to destination, instead it is just appoving it.
If `destinationData` is an empty array, then then default function is called in destination (and destination could also be a standard account).
It is probably better to first try with empty data.
An example to non-empty data can be found [here](https://github.com/KyberNetwork/smart-contracts/blob/master/test/firstscenario.js#L364) and [here](https://github.com/KyberNetwork/smart-contracts/blob/master/test/firstscenario.js#L391).

For basic testings, it is possible to set the wallet as destination address and make the transfer invoke `recieveEther` and `recieveTokens`.
