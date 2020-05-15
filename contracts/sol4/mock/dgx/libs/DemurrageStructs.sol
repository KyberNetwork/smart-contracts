pragma solidity 0.4.18;

import "./Types.sol";


library DemurrageStructs {
    using Types for Types.MutableUint;
    using Types for Types.MutableTimestamp;

    struct User {
        address account;
        bool no_demurrage_fee;
        Types.MutableUint balance;
        Types.MutableTimestamp payment_date;
    }

    struct Config {
        Types.MutableUint collector_balance;
        uint256 base;
        uint256 rate;
        address collector;
    }

    struct Demurrage {
        Config config;
        User user;
        uint256 collected_fee;
    }
}
