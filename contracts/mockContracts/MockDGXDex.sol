pragma solidity ^0.4.18;

import "../ERC20Interface.sol";
import "../Withdrawable.sol";
import "./ecverify.sol";

/// @title Mock Digix DEX
/// @author Tal Baneth
/// @dev a dummy contract that simulates Digix contract for purchase/sell with verified signatures. 
contract MockDGXDEX is Withdrawable {
    uint  constant internal GRAM_TO_MILLIGRAM = 10**3;
    uint  constant internal DGX_DECIMALS = 10**9;
    uint  constant internal BLOCK_EXPIRATION = 5;

    ERC20 token;
    address feedSigner;
    bool public sigCheck = true;
    bool public blockCheck = true;

    function MockDGXDEX(ERC20 _token, address _feedSigner, address _admin) public {
        admin = _admin;
        token = _token;
        feedSigner = _feedSigner;
    }

    function () public payable {}

    function setSigCheck (bool _sigCheck) public onlyAdmin {
        sigCheck = _sigCheck;
    }

    function setBlockCheck (bool _blockCheck) public onlyAdmin {
        blockCheck = _blockCheck;
    }

    event Purchase(bool success, uint256 purchasedAmount, address buyerAddress, uint256 weiPerDgxMg);

    function purchase(uint256 blockNumber,
                      uint256 nonce,
                      uint256 weiPerDgxMg,
                      address signer,
                      bytes signature)
    payable public
    returns (bool success, uint256 purchasedAmount)
    {

        uint256 amountMg;
        uint256 amountMgDgxWei;
        uint256 amountDgxWei;
        bool verified;
        address actualSigner;

        if (sigCheck) {
            (verified, actualSigner) = verify_signed_price(blockNumber,
                                                           nonce,
                                                           weiPerDgxMg,
                                                           signer,
                                                           signature);
            require(verified);
        }
        if (blockCheck) {
            require((blockNumber + BLOCK_EXPIRATION) >= block.number);
        }

        amountMg = (msg.value / weiPerDgxMg);
        amountMgDgxWei = amountMg * DGX_DECIMALS;
        amountDgxWei = amountMgDgxWei / GRAM_TO_MILLIGRAM;

        require(token.transfer(msg.sender, amountDgxWei));

        success = true;
        purchasedAmount = amountDgxWei;

        Purchase(success, purchasedAmount, msg.sender, weiPerDgxMg);
        
    }

    event Sell(bool success, uint256 amountWei, address sellerAddress, uint256 weiPerDgxMg);

    function sell(uint256 amount,
                  uint256 blockNumber,
                  uint256 nonce,
                  uint256 weiPerDgxMg,
                  address signer,
                  bytes signature)
    public
    returns (bool success) {

        uint256 amountWei;
        uint256 amountDgxWei;
        uint256 amountMgDgxWei;
        bool verified;
        address actualSigner;

        if (sigCheck) {
            (verified, actualSigner) = verify_signed_price(blockNumber,
                                                           nonce,
                                                           weiPerDgxMg,
                                                           signer,
                                                           signature);
            require(verified);
        }
        if (blockCheck) {
            require((blockNumber + BLOCK_EXPIRATION) >= block.number);
        }

        amountDgxWei = amount;
        amountMgDgxWei = amountDgxWei * GRAM_TO_MILLIGRAM;
        amountWei = amountMgDgxWei * weiPerDgxMg / DGX_DECIMALS;

        require(token.transferFrom(msg.sender, this, amount));
        msg.sender.transfer(amountWei);
        
        success = true;

        Sell(success, amountWei, msg.sender, weiPerDgxMg);
    }

    function verify_signed_price(uint _block_number, uint _nonce, uint _price, address _signer, bytes _signature)
    public
    returns (bool _verified, address _actual_signer)
    {
        bytes32 _hash;
        bool _verifies;
        _hash = hash_price_data(_block_number, _nonce, _price);
        
        ECVerifyContract ECVerify = new ECVerifyContract();
        
        (_verifies,_actual_signer) = ECVerify.ecrecovery(_hash, _signature);
        _verified = (_verifies && (_actual_signer == _signer));
    }

    function concat_price_data(uint _a, uint _b, uint _c) internal pure returns (string _result) {
        uint maxlength = 100;
        bytes memory _reversed = new bytes(maxlength);
        uint i = 0;
        uint t = 0;
        uint _remainder;
        while(_c != 0) {
            _remainder = _c % 10;
            _c = _c / 10;
            _reversed[i++] = byte(48 + _remainder);
            t++;
        }
        _reversed[i++] = byte(0x3a);
        t++;
        while(_b != 0) {
            _remainder = _b % 10;
            _b = _b / 10;
            _reversed[i++] = byte(48 + _remainder);
            t++;
        }
        _reversed[i++] = byte(0x3a);
        t++;
        while(_a != 0) {
            _remainder = _a % 10;
              _a = _a / 10;
              _reversed[i++] = byte(48 + _remainder);
              t++;
        }

        uint _x = t;

        while(_x != 0) {
            uint _rem_x = _x % 10;
            _x = _x / 10;
            _reversed[i++] = byte(48 + _rem_x);
            t++;
        }

        bytes memory _correct = new bytes(t);
        uint k = 0;
        uint j = t - 1;

        while(t > 0) {
            _correct[k] = _reversed[--t];
            k++;
            j--;
        }
        _result = string(_correct);
    }

    function hash_price_data(uint _block_number, uint _nonce, uint _price) public pure returns (bytes32 _keccak_hash) {
        string memory _message = concat_price_data(_block_number, _nonce, _price);
        bytes memory _prefix = "\x19Ethereum Signed Message:\n";
        _keccak_hash = keccak256(_prefix, _message);
    }
}