import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCtrsRecords, parseRosterBody, VatusaError } from './vatusa';

describe('fetchCtrsRecords', () => {
	const env = { VATUSA_API_KEY: 'made-up-key' };
	afterEach(() => vi.unstubAllGlobals());

	function stub(response: Response) {
		const fetchMock = vi.fn().mockResolvedValue(response);
		vi.stubGlobal('fetch', fetchMock);
		return fetchMock;
	}

	it('reads the records from the student’s records URL with the key', async () => {
		const fetchMock = stub(
			Response.json({
				data: [
					{
						id: 4,
						student_id: 1000001,
						instructor_id: 1000002,
						session_date: '2026-06-10 15:00:00',
						facility_id: 'ZID',
						position: 'IND_TWR',
						ots_status: 3
					}
				]
			})
		);
		const records = await fetchCtrsRecords(env, '1000001');
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.vatusa.net/v2/user/1000001/training/records?apikey=made-up-key'
		);
		expect(records).toEqual([
			{
				id: 4,
				studentId: 1000001,
				instructorId: 1000002,
				sessionDate: '2026-06-10 15:00:00',
				facility: 'ZID',
				position: 'IND_TWR',
				otsStatus: 3
			}
		]);
	});

	it('throws VatusaError with the status on a non-2xx', async () => {
		stub(Response.json({ data: { msg: 'Forbidden' } }, { status: 403 }));
		const error = await fetchCtrsRecords(env, '1000001').catch((e) => e);
		expect(error).toBeInstanceOf(VatusaError);
		expect(error.status).toBe(403);
		expect(error.message).toContain('Forbidden');
	});

	it('throws VatusaError on a body that is not JSON', async () => {
		stub(new Response('<html>oops</html>', { status: 200 }));
		await expect(fetchCtrsRecords(env, '1000001')).rejects.toBeInstanceOf(VatusaError);
	});

	it('throws VatusaError on JSON that is not a records body', async () => {
		stub(Response.json({ nope: true }));
		await expect(fetchCtrsRecords(env, '1000001')).rejects.toBeInstanceOf(VatusaError);
	});

	it('throws VatusaError, without calling VATUSA, when there is no key', async () => {
		const fetchMock = stub(Response.json({ data: [] }));
		await expect(fetchCtrsRecords({}, '1000001')).rejects.toBeInstanceOf(VatusaError);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

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
