
# Step to deploy reserve:
### Tranditional way:
- config the .env variable *PRIVATE_KEY*
- run command
```
node web3deployment/reserveDeploy/fpr/enhancedStepsDeployer2.js --rpcUrl https://ropsten.infura.io/v3/YOUR_INFURA_ID  --gas-price-gwei 5
```

### Buidler way:
- config the .env varialbe *PRIVATE_KEY* and *INFURA_API_KEY*
- run command
```
npx buidler run --no-compile --network ropsten web3deployment/reserveDeploy/fpr/enhancedStepsDeployer.js
```