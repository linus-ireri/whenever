const pad2 = (value) => String(value).padStart(2, '0')

export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  return `${year}-${month}-${day}`
}

export function getLocalTimeString(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function getGmtDateString(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function getGmtTimeString(date = new Date()) {
  return date.toISOString().slice(11, 16)
}

export function getTimezoneLabel(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  const hours = Math.floor(absolute / 60)
  const minutes = absolute % 60
  return `GMT${sign}${hours}${minutes ? `:${pad2(minutes)}` : ''}`
}

export function getNowContext(date = new Date()) {
  return {
    localDate: getLocalDateString(date),
    localTime: getLocalTimeString(date),
    localWeekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
    gmtDate: getGmtDateString(date),
    gmtTime: getGmtTimeString(date),
    timezone: getTimezoneLabel(date),
    year: date.getFullYear(),
  }
}
