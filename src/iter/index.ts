import IterResult from '../iterresult'
import {
  freqIsDailyOrGreater,
  Frequency,
  Options,
  ParsedOptions,
  QueryMethodTypes,
} from '../types'
import {
  combine,
  daysBetween,
  fromOrdinal,
  MAXYEAR,
  monthsBetween,
  weeksBetween,
  yearsBetween,
} from '../dateutil'
import Iterinfo from '../iterinfo/index'
import { RRule } from '../rrule'
import { buildTimeset } from '../parseoptions'
import { includes, isPresent, notEmpty } from '../helpers'
import { DateWithZone } from '../datewithzone'
import { buildPoslist } from './poslist'
import { DateTime, Time } from '../datetime'

const OPTIMISABLE_FREQUENCIES_SET = new Set([
  Frequency.YEARLY,
  Frequency.MONTHLY,
  Frequency.WEEKLY,
  Frequency.DAILY,
])

function optimiseOptions<M extends QueryMethodTypes>(
  iterResult: IterResult<M>,
  parsedOptions: ParsedOptions,
  origOptions: Partial<Options>
) {
  const {
    freq,
    count,
    bymonth,
    bysetpos,
    bymonthday,
    byyearday,
    byweekno,
    byhour,
    byminute,
    bysecond,
    byeaster,
    interval = 1,
  } = origOptions
  const { method, minDate } = iterResult
  const { dtstart } = parsedOptions
  let optimisedDtStart = dtstart

  if (
    method === 'before' ||
    !minDate ||
    minDate < dtstart ||
    !OPTIMISABLE_FREQUENCIES_SET.has(freq) ||
    count ||
    bymonth ||
    bysetpos ||
    bymonthday ||
    byyearday ||
    byweekno ||
    byhour ||
    byminute ||
    bysecond ||
    byeaster
  ) {
    return parsedOptions
  }

  switch (freq) {
    case Frequency.DAILY: {
      const diffDays = Math.abs(daysBetween(minDate, dtstart))
      const intervalsInDiff = Math.floor(diffDays / interval)

      if (intervalsInDiff < 2) {
        break
      }

      optimisedDtStart = new Date(
        new Date(dtstart).setDate(
          dtstart.getDate() + (intervalsInDiff - 1) * interval
        )
      )
      break
    }
    case Frequency.WEEKLY: {
      const diffWeeks = Math.abs(weeksBetween(minDate, dtstart))
      const intervalsInDiff = Math.floor(diffWeeks / interval)

      if (intervalsInDiff < 2) {
        break
      }

      optimisedDtStart = new Date(
        new Date(dtstart).setDate(
          dtstart.getDate() + (intervalsInDiff - 1) * interval * 7
        )
      )
      break
    }
    case Frequency.MONTHLY: {
      const diffMonths = Math.abs(monthsBetween(minDate, dtstart))
      const intervalsInDiff = Math.floor(diffMonths / interval)

      if (intervalsInDiff < 2) {
        break
      }

      const resultDate = new Date(dtstart)

      optimisedDtStart = new Date(
        resultDate.setMonth(
          resultDate.getMonth() + (intervalsInDiff - 1) * interval
        )
      )
      break
    }
    case Frequency.YEARLY: {
      const diffYears = Math.abs(yearsBetween(minDate, dtstart))
      const intervalsInDiff = Math.floor(diffYears / interval)

      if (intervalsInDiff < 2) {
        break
      }

      const resultDate = new Date(dtstart)

      optimisedDtStart = new Date(
        resultDate.setFullYear(
          resultDate.getFullYear() + (intervalsInDiff - 1) * interval
        )
      )
      break
    }
  }

  return { ...parsedOptions, dtstart: optimisedDtStart }
}

export function iter<M extends QueryMethodTypes>(
  iterResult: IterResult<M>,
  parsedOptions: ParsedOptions,
  origOptions: Partial<Options>
) {
  parsedOptions = optimiseOptions(iterResult, parsedOptions, origOptions)
  const { freq, dtstart, interval, until, bysetpos } = parsedOptions

  let count = parsedOptions.count
  if (count === 0 || interval === 0) {
    return emitResult(iterResult)
  }

  const counterDate = DateTime.fromDate(dtstart)

  const ii = new Iterinfo(parsedOptions)
  ii.rebuild(counterDate.year, counterDate.month)

  let timeset = makeTimeset(ii, counterDate, parsedOptions)

  for (;;) {
    const [dayset, start, end] = ii.getdayset(freq)(
      counterDate.year,
      counterDate.month,
      counterDate.day
    )

    const filtered = removeFilteredDays(dayset, start, end, ii, parsedOptions)

    if (notEmpty(bysetpos)) {
      const poslist = buildPoslist(bysetpos, timeset, start, end, ii, dayset)

      for (let j = 0; j < poslist.length; j++) {
        const res = poslist[j]
        if (until && res > until) {
          return emitResult(iterResult)
        }

        if (res >= dtstart) {
          const rezonedDate = rezoneIfNeeded(res, parsedOptions)
          if (!iterResult.accept(rezonedDate)) {
            return emitResult(iterResult)
          }

          if (count) {
            --count
            if (!count) {
              return emitResult(iterResult)
            }
          }
        }
      }
    } else {
      for (let j = start; j < end; j++) {
        const currentDay = dayset[j]
        if (!isPresent(currentDay)) {
          continue
        }

        const date = fromOrdinal(ii.yearordinal + currentDay)
        for (let k = 0; k < timeset.length; k++) {
          const time = timeset[k]
          const res = combine(date, time)
          if (until && res > until) {
            return emitResult(iterResult)
          }

          if (res >= dtstart) {
            const rezonedDate = rezoneIfNeeded(res, parsedOptions)
            if (!iterResult.accept(rezonedDate)) {
              return emitResult(iterResult)
            }

            if (count) {
              --count
              if (!count) {
                return emitResult(iterResult)
              }
            }
          }
        }
      }
    }
    if (parsedOptions.interval === 0) {
      return emitResult(iterResult)
    }

    // Handle frequency and interval
    counterDate.add(parsedOptions, filtered)

    if (counterDate.year > MAXYEAR) {
      return emitResult(iterResult)
    }

    if (!freqIsDailyOrGreater(freq)) {
      timeset = ii.gettimeset(freq)(
        counterDate.hour,
        counterDate.minute,
        counterDate.second,
        0
      )
    }

    ii.rebuild(counterDate.year, counterDate.month)
  }
}

function isFiltered(
  ii: Iterinfo,
  currentDay: number,
  options: ParsedOptions
): boolean {
  const {
    bymonth,
    byweekno,
    byweekday,
    byeaster,
    bymonthday,
    bynmonthday,
    byyearday,
  } = options

  return (
    (notEmpty(bymonth) && !includes(bymonth, ii.mmask[currentDay])) ||
    (notEmpty(byweekno) && !ii.wnomask[currentDay]) ||
    (notEmpty(byweekday) && !includes(byweekday, ii.wdaymask[currentDay])) ||
    (notEmpty(ii.nwdaymask) && !ii.nwdaymask[currentDay]) ||
    (byeaster !== null && !includes(ii.eastermask, currentDay)) ||
    ((notEmpty(bymonthday) || notEmpty(bynmonthday)) &&
      !includes(bymonthday, ii.mdaymask[currentDay]) &&
      !includes(bynmonthday, ii.nmdaymask[currentDay])) ||
    (notEmpty(byyearday) &&
      ((currentDay < ii.yearlen &&
        !includes(byyearday, currentDay + 1) &&
        !includes(byyearday, -ii.yearlen + currentDay)) ||
        (currentDay >= ii.yearlen &&
          !includes(byyearday, currentDay + 1 - ii.yearlen) &&
          !includes(byyearday, -ii.nextyearlen + currentDay - ii.yearlen))))
  )
}

function rezoneIfNeeded(date: Date, options: ParsedOptions) {
  return new DateWithZone(date, options.tzid).rezonedDate()
}

function emitResult<M extends QueryMethodTypes>(iterResult: IterResult<M>) {
  return iterResult.getValue()
}

function removeFilteredDays(
  dayset: (number | null)[],
  start: number,
  end: number,
  ii: Iterinfo,
  options: ParsedOptions
) {
  let filtered = false
  for (let dayCounter = start; dayCounter < end; dayCounter++) {
    const currentDay = dayset[dayCounter]

    filtered = isFiltered(ii, currentDay, options)

    if (filtered) dayset[currentDay] = null
  }

  return filtered
}

function makeTimeset(
  ii: Iterinfo,
  counterDate: DateTime,
  options: ParsedOptions
): Time[] | null {
  const { freq, byhour, byminute, bysecond } = options

  if (freqIsDailyOrGreater(freq)) {
    return buildTimeset(options)
  }

  if (
    (freq >= RRule.HOURLY &&
      notEmpty(byhour) &&
      !includes(byhour, counterDate.hour)) ||
    (freq >= RRule.MINUTELY &&
      notEmpty(byminute) &&
      !includes(byminute, counterDate.minute)) ||
    (freq >= RRule.SECONDLY &&
      notEmpty(bysecond) &&
      !includes(bysecond, counterDate.second))
  ) {
    return []
  }

  return ii.gettimeset(freq)(
    counterDate.hour,
    counterDate.minute,
    counterDate.second,
    counterDate.millisecond
  )
}
