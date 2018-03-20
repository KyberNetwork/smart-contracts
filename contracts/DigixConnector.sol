pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";


interface DigixConvertor {
    function purchase(uint256 blockNum, uint256 nonce, uint256 weiPerDgxMg, address signer, bytes signature)
        payable public returns (bool, uint256);
    function sell(uint amount, uint blockNum, uint nonce, uint weiPerDgxMg, address signer, bytes signature)
        public returns (bool);
    function verify_signed_price(uint blockNum, uint nonce, uint price, address signer, bytes signature)
        public returns (bool, address);
    function hash_price_data(uint blockNum, uint nonce, uint price) public pure returns (bytes32 keccakHash);
}


contract DigixConnector is Withdrawable {
    ERC20 public digix;
    DigixConvertor public digixConvertorContract;
    uint numBlocksSignatureValid = 5;
    address public withdrawAddress = 0;

    function DigixConnector(address _admin) public{
        require(_admin != address(0));
        admin = _admin;
    }

    function () public payable {}

    function buyDigix(uint amountWei, uint blockNum, uint nonce, uint weiPerDgxMg, address signer, bytes signature)
        public onlyOperator
    {
        require(this.balance <= amountWei);
        require(blockNum <= block.number + numBlocksSignatureValid);
        digixConvertorContract.purchase.value(amountWei)(blockNum, nonce, weiPerDgxMg, signer, signature);
    }

    function sellDigix(uint amountTwei, uint blockNum, uint nonce, uint weiPerDgxMg, address signer, bytes signature)
        public onlyOperator
    {
        require(amountTwei <= digix.balanceOf(this));
        require(blockNum <= block.number + numBlocksSignatureValid);
        digixConvertorContract.sell(amountTwei, blockNum, nonce, weiPerDgxMg, signer, signature);
    }

    function withDrawDigix(uint amountTwei) public onlyOperator {
        require(withdrawAddress != address(0));
        require(digix.balanceOf(this) >= amountTwei);
        digix.transfer(withdrawAddress, amountTwei);
    }

    function withDrawEther(uint amountWei) public onlyOperator {
        require(withdrawAddress != address(0));
        require(this.balance >= amountWei);
        withdrawAddress.transfer(amountWei);
    }

    function setDigixConvertorAddress(DigixConvertor _address) public onlyAdmin{
        require(_address != address(0));

        if (digixConvertorContract != address(0)) {
            digix.approve(digixConvertorContract, 0);
        }

        digixConvertorContract = _address;
        digix.approve(digixConvertorContract, 10 ** 28);
    }

    function setDigixTokenAddress(ERC20 _address) public onlyAdmin {
        require(_address != address(0));
        digix = _address;
    }

    function setWithdrawAddress(address _address) public onlyAdmin {
        require(_address != address(0));
        withdrawAddress = _address;
    }

    function setNumBlocksSignatureValid(uint numBlocks) public onlyOperator {
        require(numBlocks > 1);
        numBlocksSignatureValid = numBlocks;
    }

    function getBalances() public view
        returns (uint connectorDigixs, uint connectorEthers, uint convertorDigixs, uint convertorEthers)
    {
        return(digix.balanceOf(this), this.balance, digix.balanceOf(digixConvertorContract),
        digixConvertorContract.balance);
    }

}
