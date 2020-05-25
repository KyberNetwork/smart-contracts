pragma solidity 0.4.18;


library Types {
    struct MutableUint {
        uint256 pre;
        uint256 post;
    }

    struct MutableTimestamp {
        MutableUint time;
        uint256 in_units;
    }

    function advance_by(MutableTimestamp memory _original, uint256 _units)
        internal
        constant
        returns (MutableTimestamp _transformed)
    {
        _transformed = _original;
        require(now >= _original.time.pre);
        uint256 _lapsed = now - _original.time.pre;
        _transformed.in_units = _lapsed / _units;
        uint256 _ticks = _transformed.in_units * _units;
        if (_transformed.in_units == 0) {
            _transformed.time.post = _original.time.pre;
        } else {
            _transformed.time = add(_transformed.time, _ticks);
        }
    }

    // DEPRECATED
    /*function add_two(MutableUint memory _original, uint256 _first, uint256 _second)
           internal
           constant
           returns (MutableUint _transformed)
  {
    require((_original.pre + _first + _second) >= _original.pre);
    _transformed = _original;
    _transformed.post = (_original.pre + _first + _second);
  }*/

    function subtract_two(MutableUint memory _original, uint256 _first, uint256 _second)
        internal
        pure
        returns (MutableUint _transformed)
    {
        require(_original.pre >= _first);
        uint256 _after_first = _original.pre - _first;
        require(_after_first >= _second);
        _transformed = _original;
        _original.post = (_after_first - _second);
    }

    function subtract_and_add(MutableUint memory _original, uint256 _to_subtract, uint256 _to_add)
        internal
        pure
        returns (MutableUint _transformed)
    {
        require(_original.pre >= _to_subtract);
        uint256 _after_subtract = _original.pre - _to_subtract;
        require((_after_subtract + _to_add) >= _after_subtract);
        _transformed.post = _after_subtract + _to_add;
    }

    /// DEPRECATED
    /*function increment(MutableUint memory _original)
           internal
           constant
           returns (MutableUint _transformed)
  {
    _transformed = _original;
    _transformed.post = _original.pre + 1;
  }*/

    /// DEPRECATED
    /*function decrement(MutableUint memory _original)
           internal
           constant
           returns (MutableUint _transformed)
  {
    _transformed = _original;
    require((_original.pre + 1) > _original.pre);
    _transformed.post = _original.pre - 1;
  }*/

    function add_and_subtract(MutableUint memory _original, uint256 _to_add, uint256 _to_subtract)
        internal
        pure
        returns (MutableUint _transformed)
    {
        require((_original.pre + _to_add) >= _original.pre);
        uint256 _after_add = _original.pre + _to_add;
        require(_after_add >= _to_subtract);
        _transformed = _original;
        _transformed.post = (_after_add - _to_subtract);
    }

    function add(MutableUint memory _original, uint256 _amount)
        internal
        pure
        returns (MutableUint _transformed)
    {
        require((_original.pre + _amount) >= _original.pre);
        _transformed = _original;
        _transformed.post = _original.pre + _amount;
    }

    function subtract(MutableUint memory _original, uint256 _amount)
        internal
        pure
        returns (MutableUint _transformed)
    {
        require(_amount <= _original.pre);
        _transformed = _original;
        _transformed.post = _original.pre - _amount;
    }

    function swap(MutableUint memory _original_a, MutableUint memory _original_b)
        internal
        pure
        returns (MutableUint _transformed_a, MutableUint _transformed_b)
    {
        _transformed_a = _original_a;
        _transformed_b = _original_b;
        _transformed_a.post = _original_b.pre;
        _transformed_b.post = _original_a.pre;
    }

    /*function transfer(MutableUint memory _original_from, MutableUint memory _original_to, uint256 _amount)
           internal
           constant
           returns (MutableUint _transformed_from, MutableUint _transformed_to)
  {
    _original_from = _transformed_from;
    _original_to = _transformed_to;
    _transformed_from.post = subtract(_transformed_from, _amount).post;
    _transformed_to.post = add(_transformed_to, _amount).post;
  }*/
}
