pragma solidity 0.4.18;

import "./Types.sol";


library TransferStructs {
    using Types for Types.MutableUint;
    using Types for Types.MutableTimestamp;

    struct User {
        address account;
        Types.MutableUint balance;
        bool no_transfer_fee;
    }

    struct Spender {
        address account;
        Types.MutableUint allowance;
    }

    struct Config {
        Types.MutableUint collector_balance;
        address collector;
        uint256 base;
        uint256 rate;
        bool global_transfer_fee_disabled;
        uint256 minimum_transfer_amount;
    }

    struct Transfer {
        User sender;
        User recipient;
        Spender spender;
        Config config;
        Types.MutableUint received_amount;
        uint256 sent_amount;
        uint256 fee;
        bool is_transfer_from;
    }
}
