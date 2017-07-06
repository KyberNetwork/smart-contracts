# Things to know

everything on kovan testnet
kyber network address = [0x2a5cfc611c26ae1332ed4b33bbeb0b4179b478f5](https://kovan.etherscan.io/address/0x2a5cfc611c26ae1332ed4b33bbeb0b4179b478f5)

kyber network abi = https://github.com/KyberNetwork/smart-contracts/blob/master/contracts/KyberNetwork.abi

Three test tokens: 0,1,2. Each is called "Test i", symbol "TSTi" for i =0,1,2
addresses = 0xdee50257770afe2a63d1d1e8f0506b1cabbd17c4, 0xcb5332a9bd3b1c46258f062a6d981c4f89b679cd, 0xbedf3c5c45f38ce7f0a6d43e729cf0ab3538c2d9

reserve address (don't think it matters to you): 0x04538b371812D928f49Bc49cDa6384Ae3b7749F3


token_i => eth (wei) rate = 2^{i+1} * (10^18), for i = 0,1,2
eth (wei) => token_i rate = (10^18)/2^{i+1}.

reserve has many (10^40) tokens now, but very few ethers.

function:
=====
```
    function trade( ERC20 source, uint srcAmount,
                    ERC20 dest, address destAddress, uint maxDestAmount,
                    uint minConversionRate,
                    bool throwOnFailure )
```

`throwOnFailure = false`
`maxDestAmount = MAX_UINT`
destAddress = simple account (not a contract).


token address = 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee means the token is ether.
If source is ether then you also need to send ether along with your call.
If source is token, then you need to call token.approve(kyber network address, amount) before your call.

very important: any value below 1000 wei/tokens is considered 0. Deals must be over 1000 wei (1000 tokens).

# get rate function
```
    function getRate( ERC20 source, ERC20 dest, uint reserveIndex ) constant returns(uint rate, uint expBlock, uint balance);
```
reserveIndex should be 0.
returns three numbers (guessing in web3 it is an array of size 3. it is like that in truffle).
rate, expiration block and balance (how many tokens reserve has).


# Kyber wallet contract
Kyber wallet integrates with existing kyber network.
User needs to deploy [this](https://github.com/KyberNetwork/smart-contracts/blob/master/contracts/KyberWallet.sol) contract with c'tor param
`_kyberNetwork = 0x2a5cfc611c26ae1332ed4b33bbeb0b4179b478f5`.
Then user should send ether and/or tokens to the contract. It can be in standard way (just `send` or `transfer` ether or tokens to contract address).

Function to call is 
```
    function convertAndCall( ERC20 srcToken, uint srcAmount,
                             ERC20 destToken, uint maxDestAmount,
                             uint minRate,
                             address destination,
                             bytes   destinationData,
                             bool onlyApproveTokens,
                             bool throwOnFail ) {
```
If `onlyApproveTokens = true` and `destToken` is not ether, then function does not transfer tokens to destination, instead it is just appoving it.
If `destinationData` is an empty array, then then default function is called in destination (and destination could also be a standard account).
It is probably better to first try with empty data.
An example to non-empty data can be found [here](https://github.com/KyberNetwork/smart-contracts/blob/master/test/firstscenario.js#L364) and [here](https://github.com/KyberNetwork/smart-contracts/blob/master/test/firstscenario.js#L391).

For basic testing, it is possible to set the wallet as destination address and make the transfer ivoke `recieveEther` and `recieveTokens`.

 
