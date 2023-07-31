
import db from '@/prisma/db';
import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { linkExistingUser, signUpNewUser } from '@/utils/socialLogin';
import { getUserSession } from '@/utils/session';
import { errors } from '@/constants';
import { signToken } from '@/utils/token';

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const userId = searchParams.get('userId');
	const callBackUrl = new URL('/login/api/google/callback', req.url).toString();

	const oAuth2Client = new OAuth2Client({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: callBackUrl });

	let state = null;

	if(userId) {
		state = await signToken({ userId }, { expiresIn: '1h' });

	}

	const authorizeUrl = oAuth2Client.generateAuthUrl({
		state: state ?? '',
		scope: [
			'https://www.googleapis.com/auth/userinfo.profile',
			'https://www.googleapis.com/auth/userinfo.email'
		]
	});

	return NextResponse.redirect(authorizeUrl);
}

export async function POST(req: NextRequest) {
	const { name, email, userId, sub: googleSub } = await req.json();
	let user;

	if(userId) {
		return linkExistingUser({ userId, name, email }, 'google', { googleSub });
	}

	user = await db.user.findFirst({
		where: {
			providers: {
				array_contains: [{ name: 'google', identifier: googleSub }]
			}
		}
	});

	if(!user) {
		return signUpNewUser({ name, email }, 'google', { googleSub });
	}

	return NextResponse.json({
		ok: true,
		user
	});
}

export async function DELETE(req: NextRequest) {
	try{
		const user = await getUserSession({ req });

		let updatedProviders = user?.providers.filter((provider : {name: string}) => provider.name !== 'google');

		const updatedFields : any = {
			providers: updatedProviders
		};

		if(updatedProviders.length === 0 && !user?.username) {
			return NextResponse.json({
				ok: false,
				error: 'You must have at least one provider or a username set.'
			});
		}

		if(updatedProviders.length === 0) {
			updatedFields.email = null;
		}

		await db.user.update({
			where: {
				id: user?.id
			},
			data: updatedFields
		});

		return NextResponse.json({
			ok: true
		});
	} catch(e) {
		console.log(e);
		return NextResponse.json({
			error: errors.DEFAULT
		}, { status: 500 });
	}
}