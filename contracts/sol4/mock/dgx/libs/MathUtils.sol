pragma solidity 0.4.18;


/// @title Digix Math Library
/// @author DigixGlobal

library MathUtils {
    /*modifier if_safe_to_add(uint256 _x, uint256 _y) {
    require(is_safe_to_add(_x, _y) == true);
    _;
  }

  modifier if_safe_to_subtract(uint256 _x, uint256 _y) {
    require(is_safe_to_subtract(_x, _y) == true);
    _;
  }*/

    /*uint256 constant ONE_DAY = 1 days;*/

    /// DEPRECATED
    /// @notice Call with two integers to determine if they are safe to add
    /// @dev Catches integer overflow
    /// param _a Integer to add
    /// param _b Integer to add
    /// @return _issafe True if the integers are safe to add
    /*function is_safe_to_add(uint256 _a, uint256 _b)
           public
           constant
           returns (bool _is_safe)
  {
    _is_safe = (_a + _b >= _a);
    return _is_safe;
  }*/

    /// @notice Returns sum of two safely-added integers
    /// @dev Uses `safeToAdd` internally; throws if unsafe
    /// @param _a Integer to add
    /// @param _b Integer to add
    /// @return _result Sum of inputs
    function add(uint256 _a, uint256 _b) public pure returns (uint256 _result) {
        _result = _a + _b;
        require(_result > _a);
    }

    /// DEPRECATED
    /// @notice Call with two integers to determine if they are safe to subtract
    /// @dev Catches integer overflow
    /// param _a Integer to subtract from
    /// param _b Integer to subtract
    /// @return _issafe True if the integers are safe to subtract
    /*function is_safe_to_subtract(uint256 _a, uint256 _b)
           public
           constant
           returns (bool _is_safe)
  {
    _is_safe = (_b <= _a);
    return _is_safe;
  }*/

    /// @notice Returns result of two safely-subtracted integers
    /// @dev Uses `safeToSubtract` internally; throws if unsafe
    /// @param _a Integer to subtract from
    /// @param _b Integer to subtract
    /// @return _result Result of subtraction
    function subtract(uint256 _a, uint256 _b) public pure returns (uint256 _result) {
        require(_a >= _b);
        _result = _a - _b;
    }

    /// DEPRECATED
    ///# @notice Calculates the rate of ???
    ///# @dev `((_unit * _a) + _b / 2) / _b`
    ///# paramm _a ??
    ///# paramm _b ??
    ///# paramm _places Number of decimal places
    ///# @return _result Result of subtraction
    /*function rate_of(uint256 _a, uint256 _b, uint256 _places)
           public
           constant
           returns (uint256 _result)
  {
    var _unit = 10 ** _places;
    _result = add((_unit * _a), (_b / 2)) / _b;
    return _result;
  }*/

    /// DEPRECATED
    ///# @notice Calculates the rate from ???
    ///# @dev `(_amount * _baserate) / (10 ** _places)`
    ///# paramm _amount ??
    ///# paramm _baserate ??
    ///# paramm _places ??
    ///# @return _fee Calculated Fee
    /*function from_rate(uint256 _amount, uint256 _baserate, uint256 _places)
           returns (uint256 _fee)
  {
    _fee = ((_amount * _baserate) / (10 ** _places));
    return _fee;
  }*/

    /// DEPRECATED
    ///# @notice Calculate demurrage time values
    ///# paramm _current_time Current block time
    ///# paramm _last_payment_date Last demurrage payment date
    ///# @return {
    ///   "_next_payment_date": "Next payment date as unix time",
    ///   "_demurrage_days": "Demurrage days calculated"
    /// }
    /*function calculate_demurrage_time(uint256 _current_time, uint256 _last_payment_date)
           returns (uint256 _next_payment_date, uint256 _demurrage_days)
  {
    var _time_difference = subtract(_current_time, _last_payment_date);
    _demurrage_days = _time_difference / (1 days);
    var _remainder = _time_difference % (1 days);
    var _demurrage_seconds = _demurrage_days * (1 days);
    _next_payment_date = subtract(add(_last_payment_date, _demurrage_seconds), _remainder);
    return (_next_payment_date, _demurrage_days);
  }*/

    /// DEPRECATED
    ///# @notice Calculate demurrage fee
    ///# paramm _demurrage_days Days since last demurrage payment
    ///# paramm _unit_size Minimum amount for demurrage fees
    ///# paramm _fee_per_unit Amount of daily demurrage to deduct for every `_demurrage_minimum`
    ///# paramm _raw_balance Account balance
    ///# @return _demurrage_fee The demurrage fee due
    /*function calculate_demurrage_fee(uint256 _demurrage_days, uint256 _unit_size, uint256 _fee_per_unit, uint256 _raw_balance)
           returns (uint256 _demurrage_fee)
  {
    if (_demurrage_days == 0) {
      _demurrage_fee = 0;
    } else {
      var _billable_amount = (_raw_balance / _unit_size);
      _demurrage_fee = (_billable_amount * _demurrage_days * _fee_per_unit);
    }
    return _demurrage_fee;
  }*/

    /// DEPRECATED
    ///# @notice Get demurrage info
    ///# paramm _current_time Current block time
    ///# paramm _last_payment_date Last demurrage payment date
    ///# paramm _raw_balance Account balance
    ///# paramm _unit_size Minimum amount needed to charge demurrage fees
    ///# paramm _fee_per_unit The amount of daily demurrage deduct for every `_minimum_for_demurrage`
    /// @return {
    ///    "_demurrage_fee": "Fee charged against current balance",
    ///    "_demurrage_days": "Demurrage days calculated",
    ///    "_billable_amount": "Amount eligible for demurrage calculation",
    ///    "_next_payment_date": "Timestamp to use for next payment date"
    /// }
    /*function get_demurrage_info(uint256 _current_time, uint256 _last_payment_date, uint256 _raw_balance, uint256 _unit_size, uint256 _fee_per_unit)
           returns (uint256 _demurrage_fee, uint256 _demurrage_days, uint256 _balance_after, uint256 _next_payment_date)
  {
    _demurrage_days = (subtract(_current_time, _last_payment_date)) / ONE_DAY;
    uint256 _billable_amount = (_raw_balance / _unit_size);
    if (_demurrage_days == 0) {
      _demurrage_fee = 0;
      _next_payment_date = _last_payment_date;
      _balance_after = _raw_balance;
    } else {
      _demurrage_fee = (_billable_amount * _demurrage_days * _fee_per_unit);
      var _remainder = subtract(_current_time, _last_payment_date) % ONE_DAY;
      _next_payment_date = subtract(add(_last_payment_date, (_demurrage_days * ONE_DAY)), _remainder);
      _balance_after = subtract(_raw_balance, _demurrage_fee);
    }
    return (_demurrage_fee, _demurrage_days, _balance_after, _next_payment_date);
  }*/

    /// DEPRECATED
    ///# @notice Calculate Transaction Fee
    ///# paramm _sending_amount The amount being sent
    ///# paramm _unit_size The minimum amount that can be sent
    ///# paramm _fee_per_unit The fee per unit
    ///# @return _tx_fee The transaction fee due
    /*function get_tx_fee(uint256 _sending_amount, uint256 _unit_size, uint256 _fee_per_unit)
           returns (uint256 _tx_fee)
  {
    _tx_fee = (_sending_amount / _unit_size) * _fee_per_unit;
    return _tx_fee;
  }*/

    function calculate_recast_fee(uint256 _asset_weight, uint256 _unit_size, uint256 _fee_per_unit)
        public
        pure
        returns (uint256 _recast_fee)
    {
        uint256 _weight_times_fee_per_unit = _asset_weight * _fee_per_unit;
        require(_weight_times_fee_per_unit / _asset_weight == _fee_per_unit);
        _recast_fee = _weight_times_fee_per_unit / _unit_size;
        return _recast_fee;
    }
}
