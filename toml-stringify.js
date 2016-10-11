'use strict'
module.exports = stringify

function stringify (obj) {
  if (obj === null) throw typeError('null')
  if (obj === undefined) throw typeError('undefined')
  if (typeof obj !== 'object') throw typeError(typeof obj)

  return stringifyObject('', '', obj, true)
}

function typeError (type) {
  if (type instanceof Error) return type
  return new Error('Can only stringify objects, not ' + type)
}

function arrayOneTypeError () {
  return new Error("Array values can't have mixed types")
}

function validateValues (obj) {
  Object.keys(obj).forEach(function (key) {
    var type = tomlType(obj[key])
    if (type instanceof Error) throw type
  })
}

function getInlineKeys (obj) {
  return Object.keys(obj).filter(function (key) {
    return isInline(obj[key])
  })
}
function getComplexKeys (obj) {
  return Object.keys(obj).filter(function (key) {
    return !isInline(obj[key])
  })
}

function stringifyObject (prefix, indent, obj, multilineOk) {
  validateValues(obj)
  var inlineKeys
  var complexKeys
  if (multilineOk) {
    inlineKeys = getInlineKeys(obj)
    complexKeys = getComplexKeys(obj)
  } else {
    inlineKeys = Object.keys(obj)
    complexKeys = []
  }
  var result = []
  var inlineIndent = indent || ''
  inlineKeys.forEach(function (key) {
    var type = tomlType(obj[key])
    if (type !== 'undefined' && type !== 'null') {
      result.push(inlineIndent + stringifyKey(key) + ' = ' + stringifyInline(obj[key], multilineOk))
    }
  })
  if (result.length) result.push('')
  var complexIndent = prefix && inlineKeys.length ? indent + '  ' : ''
  complexKeys.forEach(function (key) {
    result.push(stringifyComplex(prefix, complexIndent, key, obj[key]))
  })
  return result.join('\n')
}

function isType (type) {
  return function (value) {
    return tomlType(value) === type
  }
}

function isInline (value) {
  switch (tomlType(value)) {
    case 'undefined':
    case 'null':
    case 'string':
    case 'integer':
    case 'float':
    case 'boolean':
    case 'datetime':
      return true
    case 'array':
      return !value.length || tomlType(value[0]) !== 'table'
    case 'table':
      return !(Object.keys(value).length)
    default:
      return false
  }
}

function tomlType (value) {
  if (value === undefined) {
    return 'undefined'
  } else if (value === null) {
    return 'null'
  } else if (Number.isInteger(value)) {
    return 'integer'
  } else if (typeof value === 'number') {
    return 'float'
  } else if (typeof value === 'boolean') {
    return 'boolean'
  } else if (typeof value === 'string') {
    return 'string'
  } else if (value instanceof Date) {
    return 'datetime'
  } else if (Array.isArray(value)) {
    return 'array'
  } else {
    return 'table'
  }
}

function stringifyKey (key) {
  var keyStr = String(key)
  if (/^[-A-Za-z0-9_]+$/.test(keyStr)) {
    return keyStr
  } else {
    return stringifyBasicString(keyStr)
  }
}

function stringifyBasicString (str) {
  if (/"/.test(str) && !/'/.test(str)) {
    return "'" + escapeString(str) + "'"
  } else {
    return '"' + escapeString(str).replace(/"/g, '\\"') + '"'
  }
}

function escapeString (str) {
  return str.replace(/\\/g, '\\\\')
            .replace(/[\b]/g, '\\b')
            .replace(/\t/g, '\\t')
            .replace(/\n/g, '\\n')
            .replace(/\f/g, '\\f')
            .replace(/\r/g, '\\r')
}

function stringifyMultilineString (str) {
  return '"""\n' + str.split(/\n/).map(function (str) {
    return escapeString(str).replace(/"(?="")/g, '\\"')
  }).join('\n') + '"""'
}

function stringifyInline (value, multilineOk) {
  switch (tomlType(value)) {
    case 'string':
      if (multilineOk && /\n/.test(value)) {
        return stringifyMultilineString(value)
      } else {
        return stringifyBasicString(value)
      }
    case 'integer':
      return stringifyInteger(value)
    case 'float':
      return stringifyFloat(value)
    case 'boolean':
      return stringifyBoolean(value)
    case 'datetime':
      return stringifyDatetime(value)
    case 'array':
      return stringifyInlineArray(value)
    case 'table':
      return stringifyInlineTable(value)
    default:
      throw tomlType(value)
  }
}

function stringifyInteger (value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '_')
}

function stringifyFloat (value) {
  if (value === Infinity) throw new Error("TOML can't store Infinity")
  if (Number.isNaN(value)) throw new Error("TOML can't store NaN")
  var chunks = String(value).split('.')
  var int = chunks[0]
  var dec = chunks[1]
  return stringifyInteger(int) + '.' + dec
}

function stringifyBoolean (value) {
  return String(value)
}

function stringifyDatetime (value) {
  return value.toISOString()
}

function validateArray (values) {
  var contentType = tomlType(values[0])
  if (values.length && contentType instanceof Error) {
    throw contentType
  } else if (!values.every(isType(contentType))) {
    throw arrayOneTypeError()
  }
}

function stringifyInlineArray (values) {
  validateArray(values)
  var result = '['
  var stringified = values.map(stringifyInline)
  if (stringified.join(', ').length > 60 || /\n/.test(stringified)) {
    result += '\n  ' + stringified.join(',\n  ') + '\n'
  } else {
    result += ' ' + stringified.join(', ') + (stringified.length ? ' ' : '')
  }
  return result + ']'
}

function stringifyInlineTable (value) {
  var result = []
  Object.keys(value).forEach(function (key) {
    result.push(stringifyKey(key) + ' = ' + stringifyInline(value[key], false))
  })
  return '{ ' + result.join(', ') + (result.length ? ' ' : '') + '}'
}

function stringifyComplex (prefix, indent, key, value) {
  var valueType = tomlType(value)
  if (valueType === 'array') {
    return stringifyArrayOfTables(prefix, indent, key, value)
  } else if (valueType === 'table') {
    return stringifyComplexTable(prefix, indent, key, value)
  } else {
    throw typeError(valueType)
  }
}

function stringifyArrayOfTables (prefix, indent, key, values) {
  validateArray(values)
  var firstValueType = tomlType(values[0])
  if (firstValueType !== 'table') throw typeError(firstValueType)
  var fullKey = prefix + stringifyKey(key)
  var result = ''
  values.forEach(function (table) {
    if (result.length) result += '\n'
    result += indent + '[[' + fullKey + ']]\n'
    result += stringifyObject(fullKey + '.', indent, table, true)
  })
  return result
}

function stringifyComplexTable (prefix, indent, key, value) {
  var fullKey = prefix + stringifyKey(key)
  var result = ''
  if (getInlineKeys(value).length) {
    result += indent + '[' + fullKey + ']\n'
  }
  return result + stringifyObject(fullKey + '.', indent, value, true)
}