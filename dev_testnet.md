# Setting up dev testnet enviroment
## Running parity
1. Create a file to store the password (one space).
```
echo " " > empty.txt
```
2. Run parity and unlock account 0 (this account always exist in dev mode).
```
parity --config dev --unlock 0x00a329c0648769a73afac7f9381e08fb43dbea72  --password empty.txt
```

## Distribute Ether (only once)
```
truffle test ./test/ethdistribution.js
```

## Deploy contracts (whenever needed)
```
truffle test ./test/deployment.js
```
A json dictionary with all the new addresses is logged to screen.
