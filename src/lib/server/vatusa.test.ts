import { describe, expect, it } from 'vitest';
import { parseRosterBody } from './vatusa';

describe('parseRosterBody', () => {
	// A real snowflake from the live ZID roster. As a JSON number it rounds to
	// 1146457348798431200, and 149 of 155 roster ids were stored wrong that way.
	it('keeps a 19-digit discord id exact', () => {
		const body = parseRosterBody('{"data":[{"cid":1,"discord_id":1146457348798431314}]}');
		expect(body.data[0].discord_id).toBe('1146457348798431314');
	});

	it('tolerates whitespace around the colon', () => {
		const body = parseRosterBody('{"data":[{"discord_id" : 918277062886830161}]}');
		expect(body.data[0].discord_id).toBe('918277062886830161');
	});

	it('leaves a null discord id null', () => {
		expect(parseRosterBody('{"data":[{"discord_id":null}]}').data[0].discord_id).toBeNull();
	});

	it('does not touch other numeric fields', () => {
		const body = parseRosterBody('{"data":[{"cid":1617100,"rating":2,"discord_id":1}]}');
		expect(body.data[0].cid).toBe(1617100);
		expect(body.data[0].rating).toBe(2);
	});
});
